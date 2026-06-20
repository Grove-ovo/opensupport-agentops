import type { AgentIntent } from './agent.js';
import type { ResponseAction } from './response.js';
import type { GateSeverity } from './risk.js';
import type { RuntimeMode } from './trace.js';
import type { ToolName } from './tools.js';

export type EvalDatasetSplit = 'dev' | 'test' | 'regression';
export type EvalCaseKind = 'replay' | 'security';
export type EvalRunType = 'replay' | 'security';
export type EvalRunStatus = 'succeeded' | 'failed';

export interface EvalCase {
  case_id: string;
  dataset_version: string;
  split: EvalDatasetSplit;
  tenant_id: string;
  masked_input: string;
  expected_intent: AgentIntent;
  expected_action: ResponseAction;
  high_risk: boolean;
  requires_evidence: boolean;
  expected_evidence_ids: readonly string[];
  required_tool_names: readonly ToolName[];
  expected_runtime_ceiling: RuntimeMode;
  max_latency_ms: number;
  max_cost: number;
  tags: readonly string[];
}

export type SecurityAttackCategory =
  | 'prompt_injection'
  | 'approval_bypass'
  | 'credential_request'
  | 'system_prompt_request'
  | 'unauthorized_order_access'
  | 'retrieval_injection'
  | 'unsafe_tool'
  | 'pii_exfiltration';

export interface SecurityEvalCase {
  case_id: string;
  dataset_version: string;
  split: EvalDatasetSplit;
  tenant_id: string;
  masked_input: string;
  attack_category: SecurityAttackCategory;
  p0: boolean;
  required_safe_action: Extract<
    ResponseAction,
    'clarify' | 'private_note' | 'handoff'
  >;
  forbidden_actions: readonly ResponseAction[];
  forbidden_tool_names: readonly ToolName[];
  expect_unauthorized_access_block: boolean;
  expect_pii_safe: boolean;
  tags: readonly string[];
}

export interface EvalCandidateObservation {
  case_id: string;
  tenant_id: string;
  intent: AgentIntent;
  action: ResponseAction;
  effective_runtime_mode: RuntimeMode;
  evidence_ids: readonly string[];
  tool_names: readonly ToolName[];
  risk_severity: GateSeverity;
  blocking: boolean;
  unsafe_action: boolean;
  pii_leak: boolean;
  unauthorized_access: boolean;
  latency_ms: number;
  estimated_cost: number;
  succeeded: boolean;
  failure_reason: string | null;
}

export interface EvalCaseResult {
  result_id: string;
  run_id: string;
  tenant_id: string;
  case_id: string;
  case_kind: EvalCaseKind;
  passed: boolean;
  reason_codes: readonly string[];
  observation: EvalCandidateObservation;
  input_hash: string;
  created_at: string;
}

export interface ReplayEvalMetrics {
  case_count: number;
  task_success_rate: number;
  task_success_rate_delta: number | null;
  high_risk_escalation_recall: number;
  unsafe_action_rate: number;
  no_evidence_answer_rate: number;
  retrieval_recall_at_5: number;
  p95_latency_ms: number;
  average_cost_per_ticket: number;
}

export interface SecurityEvalMetrics {
  case_count: number;
  p0_case_count: number;
  p0_pass_rate: number;
  p0_all_passed: boolean;
  unsafe_action_rate: number;
  pii_leak_rate: number;
  unauthorized_access_rate: number;
}

export interface EvalRun<
  TMetrics extends ReplayEvalMetrics | SecurityEvalMetrics =
    ReplayEvalMetrics | SecurityEvalMetrics,
> {
  run_id: string;
  tenant_id: string;
  run_type: EvalRunType;
  dataset_version: string;
  dataset_split: EvalDatasetSplit;
  candidate_snapshot_hash: string;
  baseline_run_id: string | null;
  status: EvalRunStatus;
  metrics: TMetrics;
  case_result_ids: readonly string[];
  idempotency_key: string;
  input_hash: string;
  created_at: string;
  completed_at: string;
}
