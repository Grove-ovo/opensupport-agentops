import type { TraceVersionSnapshot } from './trace.js';

export type ReleaseCandidateState =
  | 'draft'
  | 'evaluating'
  | 'failed'
  | 'shadow'
  | 'assist'
  | 'auto'
  | 'archived';

export type ReleaseCandidateActorType = 'system' | 'operator' | 'scheduler';

export type ReleaseCandidateReasonCode =
  | 'evaluation_started'
  | 'evaluation_failed'
  | 'promoted_shadow'
  | 'promoted_assist'
  | 'promoted_auto'
  | 'candidate_archived';

export interface ReleaseCandidateSnapshot extends TraceVersionSnapshot {
  candidate_id: string;
  tenant_id: string;
  replay_eval_run_id: string;
  security_eval_run_id: string;
  config_snapshot_hash: string;
  snapshot_hash: string;
  created_at: string;
}

export interface ReleaseCandidate {
  snapshot: ReleaseCandidateSnapshot;
  state: ReleaseCandidateState;
  updated_at: string;
}

export interface ReleaseCandidateTransition {
  transition_id: string;
  candidate_id: string;
  tenant_id: string;
  from_state: ReleaseCandidateState;
  to_state: ReleaseCandidateState;
  reason_code: ReleaseCandidateReasonCode;
  actor_type: ReleaseCandidateActorType;
  actor_id: string | null;
  idempotency_key: string;
  input_hash: string;
  created_at: string;
}

export interface ReleaseCandidateTransitionCommand {
  candidate_id: string;
  tenant_id: string;
  expected_state: ReleaseCandidateState;
  next_state: ReleaseCandidateState;
  reason_code: ReleaseCandidateReasonCode;
  actor_type: ReleaseCandidateActorType;
  actor_id: string | null;
  idempotency_key: string;
  occurred_at?: string;
}

export interface ReleaseCandidateTransitionResult {
  status: 'applied' | 'duplicate';
  candidate: ReleaseCandidate;
  transition: ReleaseCandidateTransition;
}

export type ReleaseGateName =
  | 'task_success_regression'
  | 'high_risk_escalation_recall'
  | 'replay_unsafe_action_rate'
  | 'no_evidence_answer_rate'
  | 'retrieval_recall_at_5'
  | 'p95_latency_ms'
  | 'average_cost_per_ticket'
  | 'security_p0'
  | 'security_unsafe_action_rate'
  | 'security_pii_leak_rate'
  | 'security_unauthorized_access_rate';

export type ReleaseGateReasonCode =
  | 'within_threshold'
  | 'task_success_regression'
  | 'escalation_recall_below_threshold'
  | 'unsafe_action_detected'
  | 'no_evidence_rate_exceeded'
  | 'retrieval_recall_below_threshold'
  | 'latency_budget_exceeded'
  | 'cost_budget_exceeded'
  | 'security_p0_failed'
  | 'pii_leak_detected'
  | 'unauthorized_access_detected';

export type ReleaseGateOperator = 'gte' | 'lte' | 'eq' | 'is_true';
export type ReleasePromotionState = Extract<
  ReleaseCandidateState,
  'failed' | 'shadow' | 'assist' | 'auto'
>;

export interface ReleaseGateDecision {
  decision_id: string;
  result_id: string;
  candidate_id: string;
  tenant_id: string;
  gate_name: ReleaseGateName;
  decision: 'pass' | 'fail';
  actual_value: number | boolean;
  threshold_operator: ReleaseGateOperator;
  threshold_value: number | boolean;
  reason_code: ReleaseGateReasonCode;
  severity: 'P0' | 'P1' | 'P2';
  blocking: boolean;
  promotion_ceiling: ReleasePromotionState;
  input_hash: string;
  created_at: string;
}

export interface ReleaseGateResult {
  result_id: string;
  candidate_id: string;
  tenant_id: string;
  candidate_snapshot_hash: string;
  replay_eval_run_id: string;
  security_eval_run_id: string;
  decisions: readonly ReleaseGateDecision[];
  promotion_state: ReleasePromotionState;
  idempotency_key: string;
  input_hash: string;
  created_at: string;
}
