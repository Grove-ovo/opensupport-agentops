import type { ReleaseGateName } from './release.js';

export type FailureBucket =
  | 'security'
  | 'grounding'
  | 'retrieval'
  | 'tool'
  | 'risk'
  | 'latency'
  | 'cost'
  | 'regression'
  | 'quality'
  | 'infrastructure';

export type FailureSourceType = 'eval_case' | 'release_gate';

export interface FailureCase {
  failure_id: string;
  tenant_id: string;
  candidate_id: string;
  source_type: FailureSourceType;
  release_gate_result_id: string | null;
  eval_run_id: string | null;
  eval_case_result_id: string | null;
  case_id: string | null;
  gate_decision_id: string | null;
  gate_name: ReleaseGateName | null;
  bucket: FailureBucket;
  reason_code: string;
  metric_name: string | null;
  metric_value: number | null;
  input_hash: string;
  created_at: string;
}
