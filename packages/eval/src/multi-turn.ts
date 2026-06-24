import { createHash } from 'node:crypto';
import {
  isUuid,
  type EvalCandidateObservation,
  type MultiTurnEvalCase,
  type MultiTurnEvalCaseResult,
  type MultiTurnEvalMetrics,
  type MultiTurnEvalResult,
  type MultiTurnEvalTurnResult,
} from '@opensupport/shared';

import type { EvalCandidateExecutor } from './replay.js';

export interface RunMultiTurnEvalCommand {
  run_id: string;
  dataset_version: string;
  cases: readonly MultiTurnEvalCase[];
  idempotency_key: string;
  created_at?: string | undefined;
}

export type MultiTurnEvalErrorCode =
  | 'invalid_command'
  | 'scope_mismatch'
  | 'idempotency_conflict'
  | 'executor_failed';

export class MultiTurnEvalError extends Error {
  constructor(readonly code: MultiTurnEvalErrorCode, message: string) {
    super(message);
    this.name = 'MultiTurnEvalError';
  }
}

interface StoredMultiTurn {
  input_hash: string;
  result: Promise<MultiTurnEvalResult>;
}

export class MultiTurnEvalRunner {
  readonly #runs = new Map<string, StoredMultiTurn>();

  constructor(readonly executor: EvalCandidateExecutor) {}

  async run(
    command: RunMultiTurnEvalCommand,
    now: Date | string = new Date(),
  ): Promise<MultiTurnEvalResult> {
    const createdAt = normalizeTimestamp(command.created_at ?? now);
    validateCommand(command);
    const inputHash = hashMultiTurnInput(command);
    const scope = `${command.run_id}:${command.idempotency_key}`;
    const existing = this.#runs.get(scope);
    if (existing !== undefined) {
      if (existing.input_hash !== inputHash) {
        throw new MultiTurnEvalError(
          'idempotency_conflict',
          'multi-turn run key was reused with different input',
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
    command: RunMultiTurnEvalCommand,
    createdAt: string,
    inputHash: string,
  ): Promise<MultiTurnEvalResult> {
    const caseResults: MultiTurnEvalCaseResult[] = [];
    for (const evalCase of command.cases) {
      const turnResults: MultiTurnEvalTurnResult[] = [];
      const contextLossTurns: number[] = [];
      for (const turn of evalCase.turns) {
        let observation: EvalCandidateObservation;
        try {
          observation = await this.executor.execute({
            case_id: evalCase.case_id,
            dataset_version: evalCase.dataset_version,
            split: evalCase.split,
            tenant_id: evalCase.tenant_id,
            masked_input: turn.masked_input,
            expected_intent: turn.expected_intent,
            expected_action: turn.expected_action,
            high_risk: false,
            requires_evidence: false,
            expected_evidence_ids: [],
            required_tool_names: turn.required_tool_names,
            expected_runtime_ceiling: 'auto',
            max_latency_ms: 10_000,
            max_cost: 1,
            tags: [],
          });
        } catch {
          throw new MultiTurnEvalError(
            'executor_failed',
            `candidate executor failed for ${evalCase.case_id} turn ${turn.turn}`,
          );
        }
        const turnEvaluation = evaluateTurnBehavior(turn, observation);
        if (turnEvaluation.context_lost) {
          contextLossTurns.push(turn.turn);
        }
        turnResults.push({
          turn: turn.turn,
          case_id: evalCase.case_id,
          passed: turnEvaluation.passed,
          reason_codes: Object.freeze(turnEvaluation.reason_codes),
          observation: Object.freeze({
            ...observation,
            evidence_ids: Object.freeze([...observation.evidence_ids]),
            tool_names: Object.freeze([...observation.tool_names]),
          }),
        });
      }
      const passed = turnResults.every((result) => result.passed);
      caseResults.push(
        Object.freeze({
          result_id: deterministicUuid(
            `${command.run_id}:${evalCase.case_id}`,
          ),
          case_id: evalCase.case_id,
          passed,
          turn_results: Object.freeze(turnResults),
          context_loss_turns: Object.freeze(contextLossTurns),
          created_at: createdAt,
        }),
      );
    }
    const metrics = calculateMultiTurnMetrics(caseResults);
    return Object.freeze({
      status: 'created',
      dataset_version: command.dataset_version,
      case_results: Object.freeze(caseResults),
      metrics: Object.freeze(metrics),
    });
  }
}

export function calculateMultiTurnMetrics(
  caseResults: readonly MultiTurnEvalCaseResult[],
): MultiTurnEvalMetrics {
  const caseCount = caseResults.length;
  const turnCount = caseResults.reduce(
    (sum, result) => sum + result.turn_results.length,
    0,
  );
  const passedCases = caseResults.filter((result) => result.passed).length;
  const allTurnResults = caseResults.flatMap(
    (result) => result.turn_results,
  );
  const passedTurns = allTurnResults.filter((result) => result.passed).length;
  const contextLossTurns = caseResults.reduce(
    (sum, result) => sum + result.context_loss_turns.length,
    0,
  );
  const latencies = allTurnResults.map(
    (result) => result.observation.latency_ms,
  );
  const costs = allTurnResults.map(
    (result) => result.observation.estimated_cost,
  );
  return {
    case_pass_rate: ratio(passedCases, caseCount),
    turn_count: turnCount,
    case_count: caseCount,
    per_turn_pass_rate: ratio(passedTurns, turnCount),
    context_loss_rate: ratio(contextLossTurns, turnCount),
    p95_latency_ms: percentile95(latencies),
    average_cost_per_ticket: rounded(
      costs.reduce((sum, cost) => sum + cost, 0) / Math.max(turnCount, 1),
    ),
  };
}

export function evaluateTurnBehavior(
  turn: MultiTurnEvalCase['turns'][number],
  observation: EvalCandidateObservation,
): Readonly<{ passed: boolean; reason_codes: string[]; context_lost: boolean }> {
  const reasons: string[] = [];
  if (!observation.succeeded) reasons.push('candidate_failed');
  if (observation.intent !== turn.expected_intent) {
    reasons.push('intent_mismatch');
  }
  if (observation.action !== turn.expected_action) {
    reasons.push('action_mismatch');
  }
  if (
    !turn.required_tool_names.every((toolName) =>
      observation.tool_names.includes(toolName),
    )
  ) {
    reasons.push('tool_result_missing');
  }
  const behaviorFailures = new Set([
    'candidate_failed',
    'intent_mismatch',
    'action_mismatch',
    'tool_result_missing',
    'unsafe_action',
    'pii_leak',
  ]);
  if (observation.unsafe_action) reasons.push('unsafe_action');
  if (observation.pii_leak) reasons.push('pii_leak');
  const passed = !reasons.some((reason) => behaviorFailures.has(reason));
  const contextLost =
    reasons.includes('intent_mismatch') || reasons.includes('action_mismatch');
  return { passed, reason_codes: reasons, context_lost: contextLost };
}

function validateCommand(command: RunMultiTurnEvalCommand): void {
  if (
    !isUuid(command.run_id) ||
    !/^[A-Za-z0-9._:-]{1,128}$/u.test(command.dataset_version) ||
    !/^[A-Za-z0-9._:-]{1,256}$/u.test(command.idempotency_key) ||
    command.cases.length === 0 ||
    new Set(command.cases.map((evalCase) => evalCase.case_id)).size !==
      command.cases.length
  ) {
    throw new MultiTurnEvalError('invalid_command', 'invalid multi-turn command');
  }
  if (
    command.cases.some(
      (evalCase) => evalCase.dataset_version !== command.dataset_version,
    )
  ) {
    throw new MultiTurnEvalError(
      'scope_mismatch',
      'cases do not match the multi-turn dataset version',
    );
  }
}

function hashMultiTurnInput(command: RunMultiTurnEvalCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        run_id: command.run_id,
        dataset_version: command.dataset_version,
        case_ids: command.cases.map((evalCase) => evalCase.case_id),
        idempotency_key: command.idempotency_key,
      }),
    )
    .digest('hex');
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new MultiTurnEvalError(
      'invalid_command',
      'multi-turn timestamp is invalid',
    );
  }
  return date.toISOString();
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
