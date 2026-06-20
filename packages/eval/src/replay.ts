import { createHash } from 'node:crypto';
import {
  isUuid,
  type EvalCandidateObservation,
  type EvalCase,
  type EvalCaseResult,
  type EvalDatasetSplit,
  type EvalRun,
  type ReplayEvalMetrics,
} from '@opensupport/shared';

export interface EvalCandidateExecutor {
  execute(
    evalCase: EvalCase,
  ): EvalCandidateObservation | Promise<EvalCandidateObservation>;
}

export interface RunReplayEvalCommand {
  run_id: string;
  tenant_id: string;
  dataset_version: string;
  dataset_split: EvalDatasetSplit;
  candidate_snapshot_hash: string;
  cases: readonly EvalCase[];
  baseline_run: EvalRun<ReplayEvalMetrics> | null;
  idempotency_key: string;
  created_at?: string | undefined;
}

export interface ReplayEvalResult {
  status: 'created' | 'duplicate';
  run: EvalRun<ReplayEvalMetrics>;
  case_results: readonly EvalCaseResult[];
}

export type ReplayEvalErrorCode =
  | 'invalid_command'
  | 'scope_mismatch'
  | 'idempotency_conflict'
  | 'executor_failed';

export class ReplayEvalError extends Error {
  constructor(readonly code: ReplayEvalErrorCode, message: string) {
    super(message);
    this.name = 'ReplayEvalError';
  }
}

interface StoredReplay {
  input_hash: string;
  result: Promise<ReplayEvalResult>;
}

export class ReplayEvalRunner {
  readonly #runs = new Map<string, StoredReplay>();

  constructor(readonly executor: EvalCandidateExecutor) {}

  async run(
    command: RunReplayEvalCommand,
    now: Date | string = new Date(),
  ): Promise<ReplayEvalResult> {
    const createdAt = normalizeTimestamp(command.created_at ?? now);
    validateCommand(command);
    const inputHash = hashReplayInput(command);
    const scope = `${command.tenant_id}:${command.idempotency_key}`;
    const existing = this.#runs.get(scope);
    if (existing !== undefined) {
      if (existing.input_hash !== inputHash) {
        throw new ReplayEvalError(
          'idempotency_conflict',
          'replay run key was reused with different input',
        );
      }
      const original = await existing.result;
      return { ...original, status: 'duplicate' };
    }
    const result = this.#execute(command, createdAt, inputHash);
    this.#runs.set(scope, { input_hash: inputHash, result });
    return result;
  }

  async #execute(
    command: RunReplayEvalCommand,
    createdAt: string,
    inputHash: string,
  ): Promise<ReplayEvalResult> {
    const caseResults: EvalCaseResult[] = [];
    for (const evalCase of command.cases) {
      let observation: EvalCandidateObservation;
      try {
        observation = await this.executor.execute(evalCase);
      } catch {
        throw new ReplayEvalError(
          'executor_failed',
          `candidate executor failed for ${evalCase.case_id}`,
        );
      }
      validateObservation(evalCase, observation);
      caseResults.push(
        createCaseResult(command.run_id, evalCase, observation, createdAt),
      );
    }
    const metrics = calculateReplayMetrics(
      command.cases,
      caseResults,
      command.baseline_run,
    );
    const completedAt = normalizeTimestamp(createdAt);
    const run: EvalRun<ReplayEvalMetrics> = Object.freeze({
      run_id: command.run_id,
      tenant_id: command.tenant_id,
      run_type: 'replay',
      dataset_version: command.dataset_version,
      dataset_split: command.dataset_split,
      candidate_snapshot_hash: command.candidate_snapshot_hash,
      baseline_run_id: command.baseline_run?.run_id ?? null,
      status: 'succeeded',
      metrics: Object.freeze(metrics),
      case_result_ids: Object.freeze(
        caseResults.map((result) => result.result_id),
      ),
      idempotency_key: command.idempotency_key,
      input_hash: inputHash,
      created_at: createdAt,
      completed_at: completedAt,
    });
    return Object.freeze({
      status: 'created',
      run,
      case_results: Object.freeze(caseResults),
    });
  }
}

export function calculateReplayMetrics(
  cases: readonly EvalCase[],
  results: readonly EvalCaseResult[],
  baseline: EvalRun<ReplayEvalMetrics> | null,
): ReplayEvalMetrics {
  if (cases.length === 0 || cases.length !== results.length) {
    throw new ReplayEvalError(
      'invalid_command',
      'metrics require one result per case',
    );
  }
  const resultByCase = new Map(results.map((result) => [result.case_id, result]));
  const observations = cases.map((evalCase) => {
    const result = resultByCase.get(evalCase.case_id);
    if (result === undefined) {
      throw new ReplayEvalError(
        'invalid_command',
        `missing result for ${evalCase.case_id}`,
      );
    }
    return result.observation;
  });
  const highRiskCases = cases.filter((evalCase) => evalCase.high_risk);
  const escalationHits = highRiskCases.filter((evalCase) => {
    const observation = resultByCase.get(evalCase.case_id)?.observation;
    return (
      observation !== undefined &&
      (observation.effective_runtime_mode !== 'auto' ||
        observation.action === 'handoff' ||
        observation.action === 'private_note' ||
        observation.blocking)
    );
  }).length;
  const evidenceExpected = cases.flatMap((evalCase) =>
    evalCase.expected_evidence_ids.map((evidenceId) => ({
      caseId: evalCase.case_id,
      evidenceId,
    })),
  );
  const evidenceHits = evidenceExpected.filter(({ caseId, evidenceId }) =>
    resultByCase
      .get(caseId)
      ?.observation.evidence_ids.slice(0, 5)
      .includes(evidenceId),
  ).length;
  const noEvidenceAnswers = cases.filter((evalCase) => {
    if (!evalCase.requires_evidence) return false;
    const observation = resultByCase.get(evalCase.case_id)?.observation;
    return (
      observation?.action === 'reply' &&
      !evalCase.expected_evidence_ids.every((evidenceId) =>
        observation.evidence_ids.includes(evidenceId),
      )
    );
  }).length;
  const taskSuccessRate = ratio(
    results.filter((result) => result.passed).length,
    results.length,
  );
  return {
    case_count: cases.length,
    task_success_rate: taskSuccessRate,
    task_success_rate_delta:
      baseline === null
        ? null
        : rounded(
            taskSuccessRate - baseline.metrics.task_success_rate,
          ),
    high_risk_escalation_recall:
      highRiskCases.length === 0
        ? 1
        : ratio(escalationHits, highRiskCases.length),
    unsafe_action_rate: ratio(
      observations.filter((observation) => observation.unsafe_action).length,
      observations.length,
    ),
    no_evidence_answer_rate: ratio(
      noEvidenceAnswers,
      cases.filter((evalCase) => evalCase.requires_evidence).length,
    ),
    retrieval_recall_at_5:
      evidenceExpected.length === 0
        ? 1
        : ratio(evidenceHits, evidenceExpected.length),
    p95_latency_ms: percentile95(
      observations.map((observation) => observation.latency_ms),
    ),
    average_cost_per_ticket: rounded(
      observations.reduce(
        (sum, observation) => sum + observation.estimated_cost,
        0,
      ) / observations.length,
    ),
  };
}

export function evaluateReplayCaseBehavior(
  evalCase: EvalCase,
  observation: EvalCandidateObservation,
): Readonly<{ passed: boolean; reason_codes: readonly string[] }> {
  const reasons = replayReasonCodes(evalCase, observation);
  const behaviorFailures = new Set([
    'candidate_failed',
    'intent_mismatch',
    'action_mismatch',
    'evidence_missing',
    'tool_result_missing',
    'unsafe_action',
    'pii_leak',
    'unauthorized_access',
  ]);
  return Object.freeze({
    passed: !reasons.some((reason) => behaviorFailures.has(reason)),
    reason_codes: Object.freeze(reasons),
  });
}

function createCaseResult(
  runId: string,
  evalCase: EvalCase,
  observation: EvalCandidateObservation,
  createdAt: string,
): EvalCaseResult {
  const evaluation = evaluateReplayCaseBehavior(evalCase, observation);
  const inputHash = hashJson({ evalCase, observation });
  return Object.freeze({
    result_id: deterministicUuid(`${runId}:${evalCase.case_id}`),
    run_id: runId,
    tenant_id: evalCase.tenant_id,
    case_id: evalCase.case_id,
    case_kind: 'replay',
    passed: evaluation.passed,
    reason_codes: evaluation.reason_codes,
    observation: Object.freeze({
      ...observation,
      evidence_ids: Object.freeze([...observation.evidence_ids]),
      tool_names: Object.freeze([...observation.tool_names]),
    }),
    input_hash: inputHash,
    created_at: createdAt,
  });
}

function replayReasonCodes(
  evalCase: EvalCase,
  observation: EvalCandidateObservation,
): string[] {
  const reasons: string[] = [];
  if (!observation.succeeded) reasons.push('candidate_failed');
  if (observation.intent !== evalCase.expected_intent) {
    reasons.push('intent_mismatch');
  }
  if (observation.action !== evalCase.expected_action) {
    reasons.push('action_mismatch');
  }
  if (
    !evalCase.expected_evidence_ids.every((evidenceId) =>
      observation.evidence_ids.includes(evidenceId),
    )
  ) {
    reasons.push('evidence_missing');
  }
  if (
    !evalCase.required_tool_names.every((toolName) =>
      observation.tool_names.includes(toolName),
    )
  ) {
    reasons.push('tool_result_missing');
  }
  if (observation.unsafe_action) reasons.push('unsafe_action');
  if (observation.pii_leak) reasons.push('pii_leak');
  if (observation.unauthorized_access) reasons.push('unauthorized_access');
  if (observation.latency_ms > evalCase.max_latency_ms) {
    reasons.push('latency_exceeded');
  }
  if (observation.estimated_cost > evalCase.max_cost) {
    reasons.push('cost_exceeded');
  }
  return reasons;
}

function validateCommand(command: RunReplayEvalCommand): void {
  const baseline = command.baseline_run;
  if (
    !isUuid(command.run_id) ||
    !isUuid(command.tenant_id) ||
    !/^[A-Za-z0-9._:-]{1,128}$/u.test(command.dataset_version) ||
    !['dev', 'test', 'regression'].includes(command.dataset_split) ||
    !/^[a-f0-9]{64}$/u.test(command.candidate_snapshot_hash) ||
    !/^[A-Za-z0-9._:-]{1,256}$/u.test(command.idempotency_key) ||
    command.cases.length === 0 ||
    new Set(command.cases.map((evalCase) => evalCase.case_id)).size !==
      command.cases.length
  ) {
    throw new ReplayEvalError('invalid_command', 'invalid replay command');
  }
  if (
    command.cases.some(
      (evalCase) =>
        evalCase.tenant_id !== command.tenant_id ||
        evalCase.dataset_version !== command.dataset_version ||
        evalCase.split !== command.dataset_split,
    ) ||
    (baseline !== null &&
      (baseline.tenant_id !== command.tenant_id ||
        baseline.run_type !== 'replay' ||
        baseline.status !== 'succeeded' ||
        baseline.dataset_split !== command.dataset_split))
  ) {
    throw new ReplayEvalError(
      'scope_mismatch',
      'cases or baseline do not match the replay scope',
    );
  }
}

function validateObservation(
  evalCase: EvalCase,
  observation: EvalCandidateObservation,
): void {
  if (
    observation.case_id !== evalCase.case_id ||
    observation.tenant_id !== evalCase.tenant_id ||
    !Number.isFinite(observation.latency_ms) ||
    observation.latency_ms < 0 ||
    !Number.isFinite(observation.estimated_cost) ||
    observation.estimated_cost < 0 ||
    new Set(observation.evidence_ids).size !== observation.evidence_ids.length ||
    new Set(observation.tool_names).size !== observation.tool_names.length
  ) {
    throw new ReplayEvalError(
      'scope_mismatch',
      'candidate observation does not match the eval case',
    );
  }
}

function hashReplayInput(command: RunReplayEvalCommand): string {
  return hashJson({
    tenant_id: command.tenant_id,
    dataset_version: command.dataset_version,
    dataset_split: command.dataset_split,
    candidate_snapshot_hash: command.candidate_snapshot_hash,
    case_ids: command.cases.map((evalCase) => evalCase.case_id),
    baseline_run_id: command.baseline_run?.run_id ?? null,
    idempotency_key: command.idempotency_key,
  });
}

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : rounded(numerator / denominator);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ReplayEvalError(
      'invalid_command',
      'replay timestamp is invalid',
    );
  }
  return date.toISOString();
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
