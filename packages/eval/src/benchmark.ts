import { createHash } from 'node:crypto';
import {
  isUuid,
  type BenchmarkCandidateObservation,
  type BenchmarkCaseResult,
  type BenchmarkMetrics,
  type BenchmarkRun,
  type BenchmarkVariant,
  type EvalCase,
  type EvalDatasetSplit,
} from '@opensupport/shared';
import { evaluateReplayCaseBehavior } from './replay.js';

const VARIANTS = new Set<BenchmarkVariant>([
  'v0_super_agent',
  'v1_rag_only',
  'v2_rag_tools',
  'v3_selective_pipeline',
]);

export interface BenchmarkExecutionContext {
  readonly tenant_id: string;
  readonly variant: BenchmarkVariant;
  readonly variant_version: string;
  readonly dataset_version: string;
  readonly dataset_split: EvalDatasetSplit;
  readonly config_hash: string;
  readonly workload_version: string;
}

export interface BenchmarkVariantExecutor {
  execute(
    evalCase: EvalCase,
    context: BenchmarkExecutionContext,
  ):
    | BenchmarkCandidateObservation
    | Promise<BenchmarkCandidateObservation>;
}

export interface RunBenchmarkCommand {
  readonly run_id: string;
  readonly tenant_id: string;
  readonly variant: BenchmarkVariant;
  readonly variant_version: string;
  readonly dataset_version: string;
  readonly dataset_split: EvalDatasetSplit;
  readonly config_hash: string;
  readonly workload_version: string;
  readonly cases: readonly EvalCase[];
  readonly human_edit_distance_threshold: number;
  readonly idempotency_key: string;
  readonly created_at?: string | undefined;
}

export interface BenchmarkExecutionResult {
  readonly status: 'created' | 'duplicate';
  readonly run: BenchmarkRun;
  readonly case_results: readonly BenchmarkCaseResult[];
}

export type BenchmarkErrorCode =
  | 'invalid_command'
  | 'scope_mismatch'
  | 'idempotency_conflict'
  | 'executor_failed';

export class BenchmarkError extends Error {
  constructor(readonly code: BenchmarkErrorCode, message: string) {
    super(message);
    this.name = 'BenchmarkError';
  }
}

interface StoredBenchmark {
  readonly input_hash: string;
  readonly result: Promise<BenchmarkExecutionResult>;
}

export class BenchmarkRunner {
  readonly #runs = new Map<string, StoredBenchmark>();
  readonly #runScopes = new Map<string, string>();

  constructor(readonly executor: BenchmarkVariantExecutor) {}

  async run(
    command: RunBenchmarkCommand,
    now: Date | string = new Date(),
  ): Promise<BenchmarkExecutionResult> {
    const createdAt = normalizeTimestamp(command.created_at ?? now);
    validateCommand(command);
    const inputHash = hashBenchmarkInput(command);
    const scope = `${command.tenant_id}:${command.idempotency_key}`;
    const existing = this.#runs.get(scope);
    if (existing !== undefined) {
      if (existing.input_hash !== inputHash) {
        throw new BenchmarkError(
          'idempotency_conflict',
          'benchmark key was reused with different input',
        );
      }
      const original = await existing.result;
      return Object.freeze({ ...original, status: 'duplicate' });
    }
    const existingRunScope = this.#runScopes.get(command.run_id);
    if (existingRunScope !== undefined && existingRunScope !== scope) {
      throw new BenchmarkError(
        'idempotency_conflict',
        'benchmark run ID was reused with a different key',
      );
    }
    const result = this.#execute(command, createdAt, inputHash);
    this.#runs.set(scope, { input_hash: inputHash, result });
    this.#runScopes.set(command.run_id, scope);
    return result;
  }

  async #execute(
    command: RunBenchmarkCommand,
    createdAt: string,
    inputHash: string,
  ): Promise<BenchmarkExecutionResult> {
    const context: BenchmarkExecutionContext = Object.freeze({
      tenant_id: command.tenant_id,
      variant: command.variant,
      variant_version: command.variant_version,
      dataset_version: command.dataset_version,
      dataset_split: command.dataset_split,
      config_hash: command.config_hash,
      workload_version: command.workload_version,
    });
    const caseResults: BenchmarkCaseResult[] = [];
    for (const evalCase of command.cases) {
      let observation: BenchmarkCandidateObservation;
      try {
        observation = await this.executor.execute(evalCase, context);
      } catch {
        throw new BenchmarkError(
          'executor_failed',
          `benchmark executor failed for ${evalCase.case_id}`,
        );
      }
      validateObservation(command, evalCase, observation);
      caseResults.push(
        createCaseResult(command.run_id, evalCase, observation, createdAt),
      );
    }
    const metrics = calculateBenchmarkMetrics(
      command.cases,
      caseResults,
      command.human_edit_distance_threshold,
    );
    const run: BenchmarkRun = Object.freeze({
      schema_version: 'benchmark.v1',
      run_id: command.run_id,
      tenant_id: command.tenant_id,
      variant: command.variant,
      variant_version: command.variant_version,
      dataset_version: command.dataset_version,
      dataset_split: command.dataset_split,
      config_hash: command.config_hash,
      workload_version: command.workload_version,
      status: 'succeeded',
      metrics: Object.freeze(metrics),
      case_result_ids: Object.freeze(
        caseResults.map((result) => result.result_id),
      ),
      human_edit_distance_threshold:
        command.human_edit_distance_threshold,
      idempotency_key: command.idempotency_key,
      input_hash: inputHash,
      created_at: createdAt,
      completed_at: createdAt,
    });
    return Object.freeze({
      status: 'created',
      run,
      case_results: Object.freeze(caseResults),
    });
  }
}

export function calculateBenchmarkMetrics(
  cases: readonly EvalCase[],
  results: readonly BenchmarkCaseResult[],
  humanEditDistanceThreshold: number,
): BenchmarkMetrics {
  if (
    cases.length === 0 ||
    cases.length !== results.length ||
    !validRate(humanEditDistanceThreshold)
  ) {
    throw new BenchmarkError(
      'invalid_command',
      'metrics require one result per case and a valid edit threshold',
    );
  }
  const resultByCase = new Map<string, BenchmarkCaseResult>();
  for (const result of results) {
    if (resultByCase.has(result.case_id)) {
      throw new BenchmarkError(
        'invalid_command',
        `duplicate result for ${result.case_id}`,
      );
    }
    resultByCase.set(result.case_id, result);
  }
  const observations = cases.map((evalCase) => {
    const result = resultByCase.get(evalCase.case_id);
    if (
      result === undefined ||
      result.tenant_id !== evalCase.tenant_id
    ) {
      throw new BenchmarkError(
        'scope_mismatch',
        `missing or cross-scope result for ${evalCase.case_id}`,
      );
    }
    return result.observation;
  });
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
  const expectedTools = cases.flatMap((evalCase) =>
    evalCase.required_tool_names.map((toolName) => ({
      caseId: evalCase.case_id,
      toolName,
    })),
  );
  const toolHits = expectedTools.filter(({ caseId, toolName }) =>
    resultByCase.get(caseId)?.observation.tool_names.includes(toolName),
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
  const editEligible = observations.filter(
    (observation) => observation.human_edit_eligible,
  );
  return Object.freeze({
    case_count: cases.length,
    task_success_rate: ratio(
      results.filter((result) => result.passed).length,
      results.length,
    ),
    retrieval_recall_at_5:
      evidenceExpected.length === 0
        ? 1
        : ratio(evidenceHits, evidenceExpected.length),
    tool_call_accuracy:
      expectedTools.length === 0
        ? observations.every(
            (observation) => observation.tool_names.length === 0,
          )
          ? 1
          : 0
        : ratio(toolHits, expectedTools.length),
    unsafe_action_rate: ratio(
      observations.filter((observation) => observation.unsafe_action).length,
      observations.length,
    ),
    no_evidence_answer_rate: ratio(
      noEvidenceAnswers,
      cases.filter((evalCase) => evalCase.requires_evidence).length,
    ),
    human_edit_rate: ratio(
      editEligible.filter(
        (observation) =>
          (observation.edit_distance ?? 0) >
          humanEditDistanceThreshold,
      ).length,
      editEligible.length,
    ),
    p95_latency_ms: percentile95(
      observations.map((observation) => observation.latency_ms),
    ),
    average_cost_per_ticket: rounded(
      observations.reduce(
        (sum, observation) => sum + observation.estimated_cost,
        0,
      ) / observations.length,
    ),
  });
}

function createCaseResult(
  runId: string,
  evalCase: EvalCase,
  observation: BenchmarkCandidateObservation,
  createdAt: string,
): BenchmarkCaseResult {
  const evaluation = evaluateReplayCaseBehavior(evalCase, observation);
  return Object.freeze({
    result_id: deterministicUuid(`${runId}:${evalCase.case_id}`),
    run_id: runId,
    tenant_id: evalCase.tenant_id,
    case_id: evalCase.case_id,
    variant: observation.variant,
    passed: evaluation.passed,
    reason_codes: evaluation.reason_codes,
    observation: freezeObservation(observation),
    input_hash: hashStable({ evalCase, observation }),
    created_at: createdAt,
  });
}

function freezeObservation(
  observation: BenchmarkCandidateObservation,
): BenchmarkCandidateObservation {
  return Object.freeze({
    ...observation,
    evidence_ids: Object.freeze([...observation.evidence_ids]),
    tool_names: Object.freeze([...observation.tool_names]),
  });
}

function validateCommand(command: RunBenchmarkCommand): void {
  if (
    !isUuid(command.run_id) ||
    !isUuid(command.tenant_id) ||
    !VARIANTS.has(command.variant) ||
    !validVersion(command.variant_version) ||
    !validVersion(command.dataset_version) ||
    !['dev', 'test', 'regression'].includes(command.dataset_split) ||
    !validHash(command.config_hash) ||
    !validVersion(command.workload_version) ||
    !validRate(command.human_edit_distance_threshold) ||
    !/^[A-Za-z0-9._:-]{1,256}$/u.test(command.idempotency_key) ||
    command.cases.length === 0 ||
    new Set(command.cases.map((evalCase) => evalCase.case_id)).size !==
      command.cases.length
  ) {
    throw new BenchmarkError('invalid_command', 'invalid benchmark command');
  }
  if (
    command.cases.some(
      (evalCase) =>
        evalCase.tenant_id !== command.tenant_id ||
        evalCase.dataset_version !== command.dataset_version ||
        evalCase.split !== command.dataset_split,
    )
  ) {
    throw new BenchmarkError(
      'scope_mismatch',
      'benchmark cases do not match the run scope',
    );
  }
}

function validateObservation(
  command: RunBenchmarkCommand,
  evalCase: EvalCase,
  observation: BenchmarkCandidateObservation,
): void {
  const editFieldsValid = observation.human_edit_eligible
    ? validHash(observation.proposed_reply_hash) &&
      validHash(observation.final_reply_hash) &&
      validRate(observation.edit_distance)
    : observation.proposed_reply_hash === null &&
      observation.final_reply_hash === null &&
      observation.edit_distance === null;
  if (
    observation.case_id !== evalCase.case_id ||
    observation.tenant_id !== evalCase.tenant_id ||
    observation.variant !== command.variant ||
    observation.variant_version !== command.variant_version ||
    !Number.isFinite(observation.latency_ms) ||
    observation.latency_ms < 0 ||
    !Number.isFinite(observation.estimated_cost) ||
    observation.estimated_cost < 0 ||
    new Set(observation.evidence_ids).size !== observation.evidence_ids.length ||
    new Set(observation.tool_names).size !== observation.tool_names.length ||
    !editFieldsValid
  ) {
    throw new BenchmarkError(
      'scope_mismatch',
      'benchmark observation does not match the case or run scope',
    );
  }
}

function hashBenchmarkInput(command: RunBenchmarkCommand): string {
  return hashStable({
    tenant_id: command.tenant_id,
    variant: command.variant,
    variant_version: command.variant_version,
    dataset_version: command.dataset_version,
    dataset_split: command.dataset_split,
    config_hash: command.config_hash,
    workload_version: command.workload_version,
    cases: command.cases,
    human_edit_distance_threshold:
      command.human_edit_distance_threshold,
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

function validVersion(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function validRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BenchmarkError(
      'invalid_command',
      'benchmark timestamp is invalid',
    );
  }
  return date.toISOString();
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hashStable(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BenchmarkError('invalid_command', 'cannot hash non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson(record[key])}`,
      );
    return `{${fields.join(',')}}`;
  }
  throw new BenchmarkError('invalid_command', 'unsupported hash input');
}
