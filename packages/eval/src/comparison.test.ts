import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type {
  BenchmarkRun,
  BenchmarkVariant,
  EvalCase,
} from '@opensupport/shared';
import {
  BenchmarkComparisonError,
  BenchmarkRunner,
  V0SuperAgentBenchmarkAdapter,
  V1RagOnlyBenchmarkAdapter,
  V2RagToolsBenchmarkAdapter,
  V3SelectivePipelineBenchmarkAdapter,
  compareBenchmarkRuns,
  parseReplayDataset,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const now = '2026-06-20T00:00:00.000Z';
const configHash = 'a'.repeat(64);
const variants = [
  'v0_super_agent',
  'v1_rag_only',
  'v2_rag_tools',
  'v3_selective_pipeline',
] as const;

test('compares exactly V0-V3 over one immutable fixture scope', async () => {
  const runs = await fixtureRuns();
  const comparison = compareBenchmarkRuns(runs, now);

  assert.equal(comparison.schema_version, 'benchmark-comparison.v1');
  assert.equal(comparison.case_count, 50);
  assert.deepEqual(
    comparison.runs.map((run) => run.variant),
    variants,
  );
  assert.equal(new Set(runs.map((run) => run.scope_hash)).size, 1);
  assert.equal(comparison.v3_deltas.length, 3);
  assert.deepEqual(
    comparison.v3_deltas.map((item) => item.baseline_variant),
    variants.slice(0, 3),
  );
  for (const item of comparison.v3_deltas) {
    const baseline = runs.find(
      (run) => run.variant === item.baseline_variant,
    )!;
    const candidate = runs.find(
      (run) => run.variant === 'v3_selective_pipeline',
    )!;
    assert.equal(
      item.metrics.task_success_rate,
      rounded(
        candidate.metrics.task_success_rate -
          baseline.metrics.task_success_rate,
      ),
    );
    assert.equal(
      item.metrics.average_cost_per_ticket,
      rounded(
        candidate.metrics.average_cost_per_ticket -
          baseline.metrics.average_cost_per_ticket,
      ),
    );
  }
  assert.ok(Object.isFrozen(comparison));
  assert.ok(Object.isFrozen(comparison.runs));
  assert.ok(Object.isFrozen(comparison.v3_deltas));
  assert.ok(Object.isFrozen(comparison.ranking));
});

test('uses deterministic safety-first ranking before quality tie breakers', async () => {
  const runs = await fixtureRuns();
  const comparison = compareBenchmarkRuns(runs, now);
  const unsafeRates = comparison.ranking.map(
    (entry) => entry.metrics.unsafe_action_rate,
  );
  const firstUnsafe = unsafeRates.findIndex((rate) => rate > 0);

  assert.notEqual(firstUnsafe, -1);
  assert.ok(unsafeRates.slice(0, firstUnsafe).every((rate) => rate === 0));
  assert.ok(unsafeRates.slice(firstUnsafe).every((rate) => rate > 0));
  assert.deepEqual(
    comparison.ranking.map((entry) => entry.rank),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    compareBenchmarkRuns(runs, now),
    compareBenchmarkRuns([...runs].reverse(), now),
  );
});

test('rejects missing, duplicate, and mismatched benchmark runs', async () => {
  const runs = await fixtureRuns();
  assert.throws(
    () => compareBenchmarkRuns(runs.slice(0, 3), now),
    hasCode('missing_variant'),
  );
  assert.throws(
    () => compareBenchmarkRuns([...runs.slice(0, 3), runs[0]!], now),
    hasCode('duplicate_variant'),
  );
  assert.throws(
    () =>
      compareBenchmarkRuns(
        [
          ...runs.slice(0, 3),
          {
            ...runs[3]!,
            scope_hash: 'b'.repeat(64),
          },
        ],
        now,
      ),
    hasCode('scope_mismatch'),
  );
  assert.throws(
    () => compareBenchmarkRuns(runs, 'not-a-time'),
    hasCode('invalid_comparison'),
  );
});

async function fixtureRuns(): Promise<readonly BenchmarkRun[]> {
  const dataset = parseReplayDataset(
    await readFile('eval/eval_cases.jsonl', 'utf8'),
  );
  const cases = dataset.cases.filter((item) => item.split === 'test');
  const adapters = {
    v0_super_agent: new V0SuperAgentBenchmarkAdapter(),
    v1_rag_only: new V1RagOnlyBenchmarkAdapter(),
    v2_rag_tools: new V2RagToolsBenchmarkAdapter(),
    v3_selective_pipeline: new V3SelectivePipelineBenchmarkAdapter(),
  };
  return Promise.all(
    variants.map(async (variant, index) => {
      const result = await new BenchmarkRunner(adapters[variant]).run(
        command(variant, index, cases, dataset.dataset_version),
        now,
      );
      return result.run;
    }),
  );
}

function command(
  variant: BenchmarkVariant,
  index: number,
  cases: readonly EvalCase[],
  datasetVersion: string,
) {
  return {
    run_id: `018f7f4a-7c1d-7b22-8d41-1234567891${index.toString().padStart(2, '0')}`,
    tenant_id: tenantId,
    variant,
    variant_version: 'phase5-reference-v1',
    dataset_version: datasetVersion,
    dataset_split: 'test' as const,
    config_hash: configHash,
    workload_version: 'benchmark-workload-v1',
    cases,
    human_edit_distance_threshold: 0.1,
    idempotency_key: `phase5d-${variant}`,
    created_at: now,
  };
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function hasCode(code: BenchmarkComparisonError['code']) {
  return (error: unknown) =>
    error instanceof BenchmarkComparisonError && error.code === code;
}
