export type LoadIterationStatus = 'succeeded' | 'error' | 'timeout';

export type LoadIterationErrorCode =
  | 'executor_error'
  | 'timeout';

export interface LoadScenarioConfig {
  readonly scenario_id: string;
  readonly tenant_id: string;
  readonly workload_version: string;
  readonly workload_item_refs: readonly string[];
  readonly warmup_iterations: number;
  readonly iterations: number;
  readonly concurrency: number;
  readonly timeout_ms: number;
}

export interface LoadIterationResult {
  readonly iteration_index: number;
  readonly workload_item_ref: string;
  readonly status: LoadIterationStatus;
  readonly error_code: LoadIterationErrorCode | null;
  readonly latency_ms: number;
}

export interface LoadEventLoopMetrics {
  readonly utilization: number;
  readonly delay_p95_ms: number;
  readonly delay_max_ms: number;
}

export interface LoadScenarioMetrics {
  readonly measured_iterations: number;
  readonly success_count: number;
  readonly error_count: number;
  readonly timeout_count: number;
  readonly max_observed_concurrency: number;
  readonly duration_ms: number;
  readonly throughput_per_second: number;
  readonly p50_latency_ms: number;
  readonly p95_latency_ms: number;
  readonly p99_latency_ms: number;
  readonly event_loop: LoadEventLoopMetrics;
}

export interface LoadScenarioResult {
  readonly schema_version: 'load-scenario.v1';
  readonly run_id: string;
  readonly scenario: LoadScenarioConfig;
  readonly status: 'completed';
  readonly metrics: LoadScenarioMetrics;
  readonly iteration_results: readonly LoadIterationResult[];
  readonly idempotency_key: string;
  readonly input_hash: string;
  readonly created_at: string;
  readonly completed_at: string;
}
