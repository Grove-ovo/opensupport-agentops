import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  LoadIterationResult,
  LoadScenarioConfig,
} from '@opensupport/shared';
import {
  ApplicationLoadHarness,
  LoadHarnessError,
  calculateLoadMetrics,
  type LoadEventLoopProbe,
  type LoadWorkloadInvocation,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const now = '2026-06-20T00:00:00.000Z';

test('keeps warmup out of metrics and never exceeds bounded concurrency', async () => {
  let active = 0;
  let maximumActive = 0;
  const invocations: LoadWorkloadInvocation[] = [];
  const harness = testHarness(async (invocation) => {
    invocations.push(invocation);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await delay(2);
    active -= 1;
  });
  const output = await harness.run(
    command(scenario({ warmup_iterations: 3, iterations: 20, concurrency: 5 })),
  );

  assert.equal(invocations.length, 23);
  assert.equal(
    invocations.filter((item) => item.phase === 'warmup').length,
    3,
  );
  assert.equal(output.result.iteration_results.length, 20);
  assert.equal(output.result.metrics.measured_iterations, 20);
  assert.equal(output.result.metrics.success_count, 20);
  assert.equal(output.result.metrics.error_count, 0);
  assert.equal(output.result.metrics.timeout_count, 0);
  assert.equal(output.result.metrics.max_observed_concurrency, 5);
  assert.equal(maximumActive, 5);
  assert.ok(Object.isFrozen(output.result));
  assert.ok(Object.isFrozen(output.result.scenario));
  assert.ok(Object.isFrozen(output.result.iteration_results));
  assert.ok(Object.isFrozen(output.result.metrics));
});

test('isolates measured executor errors and timeouts without releasing slots early', async () => {
  let active = 0;
  let maximumActive = 0;
  const harness = testHarness(async (invocation) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    try {
      if (invocation.workload_item_ref === 'error') {
        throw new Error('fixture failure');
      }
      if (invocation.workload_item_ref === 'timeout') {
        await delay(10);
      }
    } finally {
      active -= 1;
    }
  });
  const output = await harness.run(
    command(
      scenario({
        workload_item_refs: ['success', 'error', 'timeout'],
        iterations: 6,
        concurrency: 2,
        timeout_ms: 3,
      }),
    ),
  );

  assert.equal(output.result.metrics.success_count, 2);
  assert.equal(output.result.metrics.error_count, 2);
  assert.equal(output.result.metrics.timeout_count, 2);
  assert.equal(
    output.result.metrics.success_count +
      output.result.metrics.error_count +
      output.result.metrics.timeout_count,
    6,
  );
  assert.equal(maximumActive, 2);
  assert.deepEqual(
    output.result.iteration_results.map((item) => item.error_code),
    [null, 'executor_error', 'timeout', null, 'executor_error', 'timeout'],
  );
});

test('runs deterministic scenarios at concurrency 1, 5, 10, and 25', async () => {
  for (const concurrency of [1, 5, 10, 25]) {
    let active = 0;
    let maximumActive = 0;
    const harness = testHarness(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(1);
      active -= 1;
    });
    const output = await harness.run(
      command(
        scenario({
          scenario_id: scenarioId(concurrency),
          iterations: 30,
          concurrency,
        }),
        concurrency,
      ),
    );
    assert.equal(output.result.metrics.max_observed_concurrency, concurrency);
    assert.equal(maximumActive, concurrency);
    assert.equal(output.result.metrics.measured_iterations, 30);
  }
});

test('calculates nearest-rank percentiles and throughput boundaries', () => {
  const metrics = calculateLoadMetrics(
    [
      iteration(0, 'succeeded', 10),
      iteration(1, 'error', 20),
      iteration(2, 'timeout', 30),
      iteration(3, 'succeeded', 40),
    ],
    100,
    2,
    {
      utilization: 0.25,
      delay_p95_ms: 1.5,
      delay_max_ms: 2,
    },
  );
  assert.equal(metrics.measured_iterations, 4);
  assert.equal(metrics.success_count, 2);
  assert.equal(metrics.error_count, 1);
  assert.equal(metrics.timeout_count, 1);
  assert.equal(metrics.throughput_per_second, 40);
  assert.equal(metrics.p50_latency_ms, 20);
  assert.equal(metrics.p95_latency_ms, 40);
  assert.equal(metrics.p99_latency_ms, 40);
});

test('supports a short scenario with the default Node event-loop probe', async () => {
  const output = await new ApplicationLoadHarness({
    execute: () => undefined,
  }).run(command(scenario({ iterations: 1 })));

  assert.equal(output.result.metrics.measured_iterations, 1);
  assert.ok(
    output.result.metrics.event_loop.delay_max_ms >=
      output.result.metrics.event_loop.delay_p95_ms,
  );
});

test('returns immutable duplicates and rejects conflicting keys or runs', async () => {
  const harness = testHarness(async () => undefined);
  const input = command(scenario({ iterations: 2 }));
  const [created, duplicate] = await Promise.all([
    harness.run(input),
    harness.run(input),
  ]);
  assert.equal(created.status, 'created');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(created.result.input_hash, duplicate.result.input_hash);

  await assert.rejects(
    harness.run({
      ...input,
      scenario: { ...input.scenario, concurrency: 2 },
    }),
    hasCode('idempotency_conflict'),
  );
  await assert.rejects(
    harness.run({
      ...input,
      idempotency_key: 'another-key',
    }),
    hasCode('idempotency_conflict'),
  );
});

test('fails closed for invalid commands, metrics, and warmup failures', async () => {
  await assert.rejects(
    testHarness(async () => undefined).run(
      command(scenario({ iterations: 0 })),
    ),
    hasCode('invalid_command'),
  );
  assert.throws(
    () =>
      calculateLoadMetrics([], 100, 1, {
        utilization: 0,
        delay_p95_ms: 0,
        delay_max_ms: 0,
      }),
    hasCode('invalid_command'),
  );
  await assert.rejects(
    testHarness((invocation) => {
      if (invocation.phase === 'warmup') throw new Error('warmup failure');
    }).run(
      command(scenario({ warmup_iterations: 1, iterations: 2 })),
    ),
    hasCode('warmup_failed'),
  );
});

function testHarness(
  execute: (invocation: LoadWorkloadInvocation) => void | Promise<void>,
): ApplicationLoadHarness {
  return new ApplicationLoadHarness(
    { execute },
    {
      wall_now: () => now,
      event_loop_probe_factory: () => new FixtureEventLoopProbe(),
    },
  );
}

class FixtureEventLoopProbe implements LoadEventLoopProbe {
  #started = false;

  start(): void {
    this.#started = true;
  }

  stop() {
    assert.equal(this.#started, true);
    this.#started = false;
    return {
      utilization: 0.25,
      delay_p95_ms: 1,
      delay_max_ms: 2,
    };
  }
}

function scenario(
  overrides: Partial<LoadScenarioConfig> = {},
): LoadScenarioConfig {
  return {
    scenario_id: '018f7f4a-7c1d-7b22-8d41-123456789301',
    tenant_id: tenantId,
    workload_version: 'phase5-load-v1',
    workload_item_refs: ['case-a', 'case-b'],
    warmup_iterations: 0,
    iterations: 10,
    concurrency: 1,
    timeout_ms: 100,
    ...overrides,
  };
}

function command(config: LoadScenarioConfig, suffix = 1) {
  return {
    run_id: `018f7f4a-7c1d-7b22-8d41-1234567893${suffix.toString().padStart(2, '0')}`,
    scenario: config,
    idempotency_key: `phase5-load-${suffix}`,
    created_at: now,
  };
}

function scenarioId(concurrency: number): string {
  return `018f7f4a-7c1d-7b22-8d41-1234567894${concurrency.toString().padStart(2, '0')}`;
}

function iteration(
  iterationIndex: number,
  status: LoadIterationResult['status'],
  latencyMs: number,
): LoadIterationResult {
  return {
    iteration_index: iterationIndex,
    workload_item_ref: `case-${iterationIndex}`,
    status,
    error_code:
      status === 'succeeded'
        ? null
        : status === 'timeout'
          ? 'timeout'
          : 'executor_error',
    latency_ms: latencyMs,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasCode(code: LoadHarnessError['code']) {
  return (error: unknown) =>
    error instanceof LoadHarnessError && error.code === code;
}
