import type { EvalCandidateObservation, EvalDatasetSplit } from './eval.js';

export type BenchmarkVariant =
  | 'v0_super_agent'
  | 'v1_rag_only'
  | 'v2_rag_tools'
  | 'v3_selective_pipeline';

export interface BenchmarkCandidateObservation
  extends EvalCandidateObservation {
  readonly variant: BenchmarkVariant;
  readonly variant_version: string;
  readonly human_edit_eligible: boolean;
  readonly proposed_reply_hash: string | null;
  readonly final_reply_hash: string | null;
  readonly edit_distance: number | null;
}

export interface BenchmarkMetrics {
  readonly case_count: number;
  readonly task_success_rate: number;
  readonly retrieval_recall_at_5: number;
  readonly tool_call_accuracy: number;
  readonly unsafe_action_rate: number;
  readonly no_evidence_answer_rate: number;
  readonly human_edit_rate: number;
  readonly p95_latency_ms: number;
  readonly average_cost_per_ticket: number;
}

export interface BenchmarkCaseResult {
  readonly result_id: string;
  readonly run_id: string;
  readonly tenant_id: string;
  readonly case_id: string;
  readonly variant: BenchmarkVariant;
  readonly passed: boolean;
  readonly reason_codes: readonly string[];
  readonly observation: BenchmarkCandidateObservation;
  readonly input_hash: string;
  readonly created_at: string;
}

export interface BenchmarkRun {
  readonly schema_version: 'benchmark.v1';
  readonly run_id: string;
  readonly tenant_id: string;
  readonly variant: BenchmarkVariant;
  readonly variant_version: string;
  readonly dataset_version: string;
  readonly dataset_split: EvalDatasetSplit;
  readonly config_hash: string;
  readonly workload_version: string;
  readonly status: 'succeeded';
  readonly metrics: BenchmarkMetrics;
  readonly case_result_ids: readonly string[];
  readonly human_edit_distance_threshold: number;
  readonly idempotency_key: string;
  readonly input_hash: string;
  readonly created_at: string;
  readonly completed_at: string;
}
