import {
  type BenchmarkComparison,
  type BenchmarkMetricDeltas,
  type BenchmarkMetrics,
  type BenchmarkRankingEntry,
  type BenchmarkRun,
  type BenchmarkVariant,
  type BenchmarkVariantDelta,
} from '@opensupport/shared';

const REQUIRED_VARIANTS: readonly BenchmarkVariant[] = Object.freeze([
  'v0_super_agent',
  'v1_rag_only',
  'v2_rag_tools',
  'v3_selective_pipeline',
]);
const V3_BASELINES: readonly BenchmarkVariant[] = Object.freeze([
  'v0_super_agent',
  'v1_rag_only',
  'v2_rag_tools',
]);

export type BenchmarkComparisonErrorCode =
  | 'invalid_comparison'
  | 'missing_variant'
  | 'duplicate_variant'
  | 'scope_mismatch';

export class BenchmarkComparisonError extends Error {
  constructor(
    readonly code: BenchmarkComparisonErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BenchmarkComparisonError';
  }
}

export function compareBenchmarkRuns(
  runs: readonly BenchmarkRun[],
  now: Date | string = new Date(),
): BenchmarkComparison {
  const createdAt = normalizeTimestamp(now);
  const runByVariant = validateRuns(runs);
  const orderedRuns = REQUIRED_VARIANTS.map(
    (variant) => runByVariant.get(variant)!,
  );
  const reference = orderedRuns[0]!;
  const v3 = runByVariant.get('v3_selective_pipeline')!;
  const deltas = V3_BASELINES.map((variant) =>
    variantDelta(v3, runByVariant.get(variant)!),
  );
  const ranking = [...orderedRuns]
    .sort(compareRuns)
    .map(
      (run, index): BenchmarkRankingEntry =>
        Object.freeze({
          rank: index + 1,
          variant: run.variant,
          metrics: run.metrics,
        }),
    );
  return Object.freeze({
    schema_version: 'benchmark-comparison.v1',
    tenant_id: reference.tenant_id,
    dataset_version: reference.dataset_version,
    dataset_split: reference.dataset_split,
    config_hash: reference.config_hash,
    workload_version: reference.workload_version,
    scope_hash: reference.scope_hash,
    case_count: reference.metrics.case_count,
    runs: Object.freeze(orderedRuns),
    v3_deltas: Object.freeze(deltas),
    ranking: Object.freeze(ranking),
    created_at: createdAt,
  });
}

function validateRuns(
  runs: readonly BenchmarkRun[],
): Map<BenchmarkVariant, BenchmarkRun> {
  if (runs.length === 0) {
    throw new BenchmarkComparisonError(
      'missing_variant',
      'benchmark comparison requires V0, V1, V2, and V3',
    );
  }
  const runByVariant = new Map<BenchmarkVariant, BenchmarkRun>();
  for (const run of runs) {
    if (!REQUIRED_VARIANTS.includes(run.variant)) {
      throw new BenchmarkComparisonError(
        'invalid_comparison',
        `unsupported benchmark variant ${run.variant}`,
      );
    }
    if (runByVariant.has(run.variant)) {
      throw new BenchmarkComparisonError(
        'duplicate_variant',
        `duplicate benchmark variant ${run.variant}`,
      );
    }
    runByVariant.set(run.variant, run);
  }
  const missing = REQUIRED_VARIANTS.filter(
    (variant) => !runByVariant.has(variant),
  );
  if (missing.length > 0) {
    throw new BenchmarkComparisonError(
      'missing_variant',
      `missing benchmark variants: ${missing.join(', ')}`,
    );
  }
  if (runs.length !== REQUIRED_VARIANTS.length) {
    throw new BenchmarkComparisonError(
      'invalid_comparison',
      'benchmark comparison requires exactly four runs',
    );
  }
  const reference = runByVariant.get('v0_super_agent')!;
  for (const run of runByVariant.values()) {
    if (
      run.schema_version !== 'benchmark.v1' ||
      run.status !== 'succeeded' ||
      !validHash(run.scope_hash) ||
      run.tenant_id !== reference.tenant_id ||
      run.dataset_version !== reference.dataset_version ||
      run.dataset_split !== reference.dataset_split ||
      run.config_hash !== reference.config_hash ||
      run.workload_version !== reference.workload_version ||
      run.scope_hash !== reference.scope_hash ||
      run.metrics.case_count !== reference.metrics.case_count ||
      run.human_edit_distance_threshold !==
        reference.human_edit_distance_threshold
    ) {
      throw new BenchmarkComparisonError(
        'scope_mismatch',
        'benchmark runs do not share one immutable scope',
      );
    }
  }
  return runByVariant;
}

function variantDelta(
  candidate: BenchmarkRun,
  baseline: BenchmarkRun,
): BenchmarkVariantDelta {
  return Object.freeze({
    candidate_variant: 'v3_selective_pipeline',
    baseline_variant: baseline.variant,
    metrics: Object.freeze(metricDeltas(candidate.metrics, baseline.metrics)),
  });
}

function metricDeltas(
  candidate: BenchmarkMetrics,
  baseline: BenchmarkMetrics,
): BenchmarkMetricDeltas {
  return {
    task_success_rate: delta(
      candidate.task_success_rate,
      baseline.task_success_rate,
    ),
    retrieval_recall_at_5: delta(
      candidate.retrieval_recall_at_5,
      baseline.retrieval_recall_at_5,
    ),
    tool_call_accuracy: delta(
      candidate.tool_call_accuracy,
      baseline.tool_call_accuracy,
    ),
    unsafe_action_rate: delta(
      candidate.unsafe_action_rate,
      baseline.unsafe_action_rate,
    ),
    no_evidence_answer_rate: delta(
      candidate.no_evidence_answer_rate,
      baseline.no_evidence_answer_rate,
    ),
    human_edit_rate: delta(
      candidate.human_edit_rate,
      baseline.human_edit_rate,
    ),
    p95_latency_ms: delta(
      candidate.p95_latency_ms,
      baseline.p95_latency_ms,
    ),
    average_cost_per_ticket: delta(
      candidate.average_cost_per_ticket,
      baseline.average_cost_per_ticket,
    ),
  };
}

function compareRuns(left: BenchmarkRun, right: BenchmarkRun): number {
  return (
    ascending(
      left.metrics.unsafe_action_rate,
      right.metrics.unsafe_action_rate,
    ) ||
    descending(
      left.metrics.task_success_rate,
      right.metrics.task_success_rate,
    ) ||
    descending(
      left.metrics.tool_call_accuracy,
      right.metrics.tool_call_accuracy,
    ) ||
    descending(
      left.metrics.retrieval_recall_at_5,
      right.metrics.retrieval_recall_at_5,
    ) ||
    ascending(
      left.metrics.no_evidence_answer_rate,
      right.metrics.no_evidence_answer_rate,
    ) ||
    ascending(left.metrics.human_edit_rate, right.metrics.human_edit_rate) ||
    ascending(left.metrics.p95_latency_ms, right.metrics.p95_latency_ms) ||
    ascending(
      left.metrics.average_cost_per_ticket,
      right.metrics.average_cost_per_ticket,
    ) ||
    left.variant.localeCompare(right.variant)
  );
}

function ascending(left: number, right: number): number {
  return left - right;
}

function descending(left: number, right: number): number {
  return right - left;
}

function delta(candidate: number, baseline: number): number {
  return Number((candidate - baseline).toFixed(6));
}

function validHash(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BenchmarkComparisonError(
      'invalid_comparison',
      'benchmark comparison timestamp is invalid',
    );
  }
  return date.toISOString();
}
