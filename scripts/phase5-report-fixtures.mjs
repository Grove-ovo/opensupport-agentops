import { readFile } from 'node:fs/promises';
import {
  ApplicationLoadHarness,
  BenchmarkRunner,
  V0SuperAgentBenchmarkAdapter,
  V1RagOnlyBenchmarkAdapter,
  V2RagToolsBenchmarkAdapter,
  V3SelectivePipelineBenchmarkAdapter,
  compareBenchmarkRuns,
  parseReplayDataset,
} from '../packages/eval/dist/index.js';

export const generatedAt = '2026-06-20T00:00:00.000Z';
export const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
export const configHash = 'a'.repeat(64);
export const tenantBudget = Object.freeze({
  currency: 'USD',
  per_ticket: 0.1,
  daily: 100,
});

const variants = [
  ['v0_super_agent', new V0SuperAgentBenchmarkAdapter()],
  ['v1_rag_only', new V1RagOnlyBenchmarkAdapter()],
  ['v2_rag_tools', new V2RagToolsBenchmarkAdapter()],
  ['v3_selective_pipeline', new V3SelectivePipelineBenchmarkAdapter()],
];
const concurrencyLevels = [1, 5, 10, 25];

export async function createBenchmarkComparison() {
  const { dataset, testCases } = await replayFixture();
  const runs = await Promise.all(
    variants.map(async ([variant, adapter], index) => {
      const result = await new BenchmarkRunner(adapter).run(
        {
          run_id: `018f7f4a-7c1d-7b22-8d41-1234567892${index.toString().padStart(2, '0')}`,
          tenant_id: tenantId,
          variant,
          variant_version: 'phase5-reference-v1',
          dataset_version: dataset.dataset_version,
          dataset_split: 'test',
          config_hash: configHash,
          workload_version: 'benchmark-workload-v1',
          cases: testCases,
          human_edit_distance_threshold: 0.1,
          idempotency_key: `phase5-report-${variant}`,
          created_at: generatedAt,
        },
        generatedAt,
      );
      return result.run;
    }),
  );
  return compareBenchmarkRuns(runs, generatedAt);
}

export async function createLoadScenarioResults() {
  const { dataset, testCases } = await replayFixture();
  const casesById = new Map(testCases.map((item) => [item.case_id, item]));
  return Promise.all(
    concurrencyLevels.map(async (concurrency, index) => {
      const adapter = new V3SelectivePipelineBenchmarkAdapter();
      const harness = new ApplicationLoadHarness(
        {
          execute: async (invocation) => {
            if (invocation.signal.aborted) throw new Error('aborted');
            const evalCase = casesById.get(invocation.workload_item_ref);
            if (evalCase === undefined) throw new Error('missing fixture case');
            await adapter.execute(evalCase, {
              tenant_id: tenantId,
              variant: 'v3_selective_pipeline',
              variant_version: 'phase5-reference-v1',
              dataset_version: dataset.dataset_version,
              dataset_split: 'test',
              config_hash: configHash,
              workload_version: 'phase5-load-v1',
            });
            if (invocation.signal.aborted) throw new Error('aborted');
          },
        },
        {
          monotonic_now: deterministicClock(),
          wall_now: () => generatedAt,
          event_loop_probe_factory: () =>
            deterministicEventLoopProbe(concurrency),
        },
      );
      const output = await harness.run({
        run_id: `018f7f4a-7c1d-7b22-8d41-1234567896${index.toString().padStart(2, '0')}`,
        scenario: {
          scenario_id: `018f7f4a-7c1d-7b22-8d41-1234567897${index.toString().padStart(2, '0')}`,
          tenant_id: tenantId,
          workload_version: 'phase5-load-v1',
          workload_item_refs: testCases.map((item) => item.case_id),
          warmup_iterations: 10,
          iterations: 100,
          concurrency,
          timeout_ms: 1000,
        },
        idempotency_key: `phase5-load-report-c${concurrency}`,
        created_at: generatedAt,
      });
      return output.result;
    }),
  );
}

async function replayFixture() {
  const dataset = parseReplayDataset(
    await readFile('eval/eval_cases.jsonl', 'utf8'),
  );
  return {
    dataset,
    testCases: dataset.cases.filter((item) => item.split === 'test'),
  };
}

function deterministicClock() {
  let current = 0;
  return () => {
    const value = current;
    current += 1;
    return value;
  };
}

function deterministicEventLoopProbe(concurrency) {
  let started = false;
  return {
    start() {
      started = true;
    },
    stop() {
      if (!started) throw new Error('probe was not started');
      started = false;
      const delayP95 = rounded(0.2 + concurrency * 0.02);
      return {
        utilization: rounded(0.1 + concurrency * 0.01),
        delay_p95_ms: delayP95,
        delay_max_ms: rounded(delayP95 + 0.15),
      };
    },
  };
}

function rounded(value) {
  return Number(value.toFixed(6));
}
