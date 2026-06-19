import { createHash } from 'node:crypto';
import {
  isUuid,
  type EvalCaseResult,
  type FailureBucket,
  type FailureCase,
  type ReleaseGateDecision,
  type ReleaseGateName,
  type ReleaseGateResult,
} from '@opensupport/shared';

export interface MaterializeFailuresCommand {
  tenant_id: string;
  candidate_id: string;
  eval_case_results: readonly EvalCaseResult[];
  release_gate_result: ReleaseGateResult;
  created_at?: string;
}

export type FailureMaterializationErrorCode =
  | 'invalid_command'
  | 'scope_mismatch';

export class FailureMaterializationError extends Error {
  constructor(
    readonly code: FailureMaterializationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FailureMaterializationError';
  }
}

const SECURITY_REASONS = new Set([
  'safe_action_missing',
  'forbidden_action',
  'forbidden_tool',
  'p0_not_blocked',
  'unsafe_action',
  'pii_leak',
  'unauthorized_access',
  'unauthorized_access_not_blocked',
]);

export function materializeFailureCases(
  command: MaterializeFailuresCommand,
  now: Date | string = new Date(),
): readonly FailureCase[] {
  validateCommand(command);
  const createdAt = normalizeTimestamp(command.created_at ?? now);
  const failures: FailureCase[] = [];
  for (const result of command.eval_case_results) {
    if (result.passed) continue;
    for (const reasonCode of result.reason_codes) {
      failures.push(
        createEvalFailure(
          command.candidate_id,
          result,
          reasonCode,
          createdAt,
        ),
      );
    }
  }
  for (const decision of command.release_gate_result.decisions) {
    if (decision.decision === 'pass') continue;
    failures.push(
      createGateFailure(
        command.release_gate_result,
        decision,
        createdAt,
      ),
    );
  }
  return Object.freeze(
    failures.sort((left, right) =>
      failureSortKey(left).localeCompare(failureSortKey(right)),
    ),
  );
}

export function classifyFailureBucket(
  reasonCode: string,
  gateName: ReleaseGateName | null,
  caseKind: EvalCaseResult['case_kind'] | null,
): FailureBucket {
  if (
    caseKind === 'security' ||
    SECURITY_REASONS.has(reasonCode) ||
    gateName?.startsWith('security_') ||
    gateName === 'replay_unsafe_action_rate'
  ) {
    return 'security';
  }
  if (
    reasonCode === 'evidence_missing' ||
    gateName === 'no_evidence_answer_rate'
  ) {
    return 'grounding';
  }
  if (gateName === 'retrieval_recall_at_5') return 'retrieval';
  if (reasonCode === 'tool_result_missing') return 'tool';
  if (gateName === 'high_risk_escalation_recall') return 'risk';
  if (reasonCode === 'latency_exceeded' || gateName === 'p95_latency_ms') {
    return 'latency';
  }
  if (reasonCode === 'cost_exceeded' || gateName === 'average_cost_per_ticket') {
    return 'cost';
  }
  if (gateName === 'task_success_regression') return 'regression';
  if (reasonCode === 'candidate_failed') return 'infrastructure';
  return 'quality';
}

function createEvalFailure(
  candidateId: string,
  result: EvalCaseResult,
  reasonCode: string,
  createdAt: string,
): FailureCase {
  const bucket = classifyFailureBucket(
    reasonCode,
    null,
    result.case_kind,
  );
  const metric = evalMetric(result, reasonCode);
  const inputHash = hashJson({
    candidate_id: candidateId,
    eval_run_id: result.run_id,
    eval_case_result_id: result.result_id,
    case_id: result.case_id,
    reason_code: reasonCode,
    bucket,
    metric,
  });
  return Object.freeze({
    failure_id: deterministicUuid(inputHash),
    tenant_id: result.tenant_id,
    candidate_id: candidateId,
    source_type: 'eval_case',
    release_gate_result_id: null,
    eval_run_id: result.run_id,
    eval_case_result_id: result.result_id,
    case_id: result.case_id,
    gate_decision_id: null,
    gate_name: null,
    bucket,
    reason_code: reasonCode,
    metric_name: metric.name,
    metric_value: metric.value,
    input_hash: inputHash,
    created_at: createdAt,
  });
}

function createGateFailure(
  result: ReleaseGateResult,
  decision: ReleaseGateDecision,
  createdAt: string,
): FailureCase {
  const bucket = classifyFailureBucket(
    decision.reason_code,
    decision.gate_name,
    null,
  );
  const metricValue =
    typeof decision.actual_value === 'number'
      ? decision.actual_value
      : null;
  const evalRunId = decision.gate_name.startsWith('security_')
    ? result.security_eval_run_id
    : result.replay_eval_run_id;
  const inputHash = hashJson({
    candidate_id: result.candidate_id,
    release_gate_result_id: result.result_id,
    gate_decision_id: decision.decision_id,
    gate_name: decision.gate_name,
    reason_code: decision.reason_code,
    bucket,
    metric_value: metricValue,
  });
  return Object.freeze({
    failure_id: deterministicUuid(inputHash),
    tenant_id: result.tenant_id,
    candidate_id: result.candidate_id,
    source_type: 'release_gate',
    release_gate_result_id: result.result_id,
    eval_run_id: evalRunId,
    eval_case_result_id: null,
    case_id: null,
    gate_decision_id: decision.decision_id,
    gate_name: decision.gate_name,
    bucket,
    reason_code: decision.reason_code,
    metric_name: decision.gate_name,
    metric_value: metricValue,
    input_hash: inputHash,
    created_at: createdAt,
  });
}

function evalMetric(
  result: EvalCaseResult,
  reasonCode: string,
): { name: string | null; value: number | null } {
  if (reasonCode === 'latency_exceeded') {
    return { name: 'latency_ms', value: result.observation.latency_ms };
  }
  if (reasonCode === 'cost_exceeded') {
    return {
      name: 'estimated_cost',
      value: result.observation.estimated_cost,
    };
  }
  return { name: null, value: null };
}

function validateCommand(command: MaterializeFailuresCommand): void {
  if (
    !isUuid(command.tenant_id) ||
    !isUuid(command.candidate_id) ||
    command.release_gate_result.tenant_id !== command.tenant_id ||
    command.release_gate_result.candidate_id !== command.candidate_id
  ) {
    throw new FailureMaterializationError(
      'invalid_command',
      'failure materialization command is invalid',
    );
  }
  if (
    command.eval_case_results.some(
      (result) =>
        result.tenant_id !== command.tenant_id ||
        !isUuid(result.run_id) ||
        !isUuid(result.result_id),
    )
  ) {
    throw new FailureMaterializationError(
      'scope_mismatch',
      'eval results do not match failure materialization scope',
    );
  }
}

function failureSortKey(failure: FailureCase): string {
  return [
    failure.bucket,
    failure.source_type,
    failure.case_id ?? '',
    failure.gate_name ?? '',
    failure.reason_code,
  ].join(':');
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new FailureMaterializationError(
      'invalid_command',
      'failure timestamp is invalid',
    );
  }
  return date.toISOString();
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
