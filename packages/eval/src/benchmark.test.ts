import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  BenchmarkCandidateObservation,
  BenchmarkCaseResult,
  EvalCase,
} from '@opensupport/shared';
import {
  BenchmarkError,
  BenchmarkRunner,
  calculateBenchmarkMetrics,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const runId = '018f7f4a-7c1d-7b22-8d41-1234567890ba';
const now = '2026-06-20T00:00:00.000Z';

test('calculates all eight benchmark metrics with deterministic boundaries', async () => {
  const cases = fixtureCases();
  const observations = fixtureObservations();
  const runner = runnerFor(observations);
  const result = await runner.run(command(cases), now);

  assert.equal(result.run.schema_version, 'benchmark.v1');
  assert.match(result.run.scope_hash, /^[a-f0-9]{64}$/u);
  assert.equal(result.run.metrics.case_count, 4);
  assert.equal(result.run.metrics.task_success_rate, 0.5);
  assert.equal(result.run.metrics.retrieval_recall_at_5, 0.666667);
  assert.equal(result.run.metrics.tool_call_accuracy, 0.5);
  assert.equal(result.run.metrics.unsafe_action_rate, 0.25);
  assert.equal(result.run.metrics.no_evidence_answer_rate, 0.333333);
  assert.equal(result.run.metrics.human_edit_rate, 0.25);
  assert.equal(result.run.metrics.p95_latency_ms, 9000);
  assert.equal(result.run.metrics.average_cost_per_ticket, 0.075);
  assert.ok(Object.isFrozen(result.run));
  assert.ok(Object.isFrozen(result.run.metrics));
  assert.ok(Object.isFrozen(result.case_results));
  assert.ok(Object.isFrozen(result.case_results[0]?.observation));
});

test('defines zero-denominator and exact edit-threshold behavior', () => {
  const noToolCase = replayCase('replay-0101', false, false, []);
  const noToolResult = benchmarkResult(
    noToolCase,
    observation(noToolCase.case_id, {
      human_edit_eligible: false,
      proposed_reply_hash: null,
      final_reply_hash: null,
      edit_distance: null,
    }),
  );
  const metrics = calculateBenchmarkMetrics(
    [noToolCase],
    [noToolResult],
    0.1,
  );
  assert.equal(metrics.retrieval_recall_at_5, 1);
  assert.equal(metrics.tool_call_accuracy, 1);
  assert.equal(metrics.no_evidence_answer_rate, 0);
  assert.equal(metrics.human_edit_rate, 0);

  const unexpectedTool = benchmarkResult(
    noToolCase,
    observation(noToolCase.case_id, {
      tool_names: ['get_order_status'],
      edit_distance: 0.1,
    }),
  );
  const atThreshold = calculateBenchmarkMetrics(
    [noToolCase],
    [unexpectedTool],
    0.1,
  );
  assert.equal(atThreshold.tool_call_accuracy, 0);
  assert.equal(atThreshold.human_edit_rate, 0);
});

test('returns immutable duplicates and rejects changed idempotent input', async () => {
  const cases = fixtureCases();
  const runner = runnerFor(fixtureObservations());
  const input = command(cases);
  const [created, duplicate] = await Promise.all([
    runner.run(input, now),
    runner.run(input, now),
  ]);
  assert.equal(created.status, 'created');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(created.run.input_hash, duplicate.run.input_hash);

  await assert.rejects(
    runner.run({ ...input, config_hash: 'b'.repeat(64) }, now),
    hasCode('idempotency_conflict'),
  );
  await assert.rejects(
    runner.run(
      {
        ...input,
        idempotency_key: 'another-key',
      },
      now,
    ),
    hasCode('idempotency_conflict'),
  );
});

test('fails closed for empty, duplicate, cross-scope, and incomplete inputs', async () => {
  const cases = fixtureCases();
  const runner = runnerFor(fixtureObservations());
  await assert.rejects(
    runner.run(command([]), now),
    hasCode('invalid_command'),
  );
  await assert.rejects(
    runner.run(command([cases[0]!, cases[0]!]), now),
    hasCode('invalid_command'),
  );
  await assert.rejects(
    runner.run(
      command([
        {
          ...cases[0]!,
          tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ff',
        },
      ]),
      now,
    ),
    hasCode('scope_mismatch'),
  );
  assert.throws(
    () => calculateBenchmarkMetrics(cases, [], 0.1),
    hasCode('invalid_command'),
  );
  assert.throws(
    () =>
      calculateBenchmarkMetrics(
        cases,
        [
          benchmarkResult(cases[0]!, fixtureObservations().get('replay-0001')!),
          benchmarkResult(cases[0]!, fixtureObservations().get('replay-0001')!),
          benchmarkResult(cases[2]!, fixtureObservations().get('replay-0003')!),
          benchmarkResult(cases[3]!, fixtureObservations().get('replay-0004')!),
        ],
        0.1,
      ),
    hasCode('invalid_command'),
  );
});

test('fails closed for observation scope and executor failures', async () => {
  const cases = fixtureCases();
  const mismatch = new BenchmarkRunner({
    execute: (evalCase, context) => ({
      ...observation(evalCase.case_id),
      variant: context.variant,
      variant_version: 'wrong-version',
    }),
  });
  await assert.rejects(
    mismatch.run(command(cases), now),
    hasCode('scope_mismatch'),
  );

  const failed = new BenchmarkRunner({
    execute: () => {
      throw new Error('fixture executor failure');
    },
  });
  await assert.rejects(
    failed.run(command(cases), now),
    hasCode('executor_failed'),
  );
});

test('keeps Phase 4 behavior success independent from latency and cost gates', async () => {
  const evalCase = replayCase(
    'replay-0201',
    true,
    true,
    ['get_order_status'],
  );
  const observed = observation(evalCase.case_id, {
    intent: 'order_status',
    evidence_ids: ['evidence:policy'],
    tool_names: ['get_order_status'],
    latency_ms: 9001,
    estimated_cost: 0.11,
  });
  const result = await runnerFor(new Map([[evalCase.case_id, observed]])).run(
    command([evalCase]),
    now,
  );
  assert.equal(result.run.metrics.task_success_rate, 1);
  assert.deepEqual(result.case_results[0]?.reason_codes, [
    'latency_exceeded',
    'cost_exceeded',
  ]);
});

function fixtureCases(): EvalCase[] {
  return [
    replayCase('replay-0001', true, false, []),
    replayCase('replay-0002', true, false, []),
    replayCase(
      'replay-0003',
      true,
      true,
      ['create_refund_request_dry_run'],
    ),
    replayCase('replay-0004', false, false, ['get_order_status']),
  ];
}

function fixtureObservations(): Map<string, BenchmarkCandidateObservation> {
  return new Map([
    [
      'replay-0001',
      observation('replay-0001', {
        evidence_ids: ['evidence:policy'],
        latency_ms: 1000,
        estimated_cost: 0.05,
        edit_distance: 0,
      }),
    ],
    [
      'replay-0002',
      observation('replay-0002', {
        evidence_ids: [],
        latency_ms: 2000,
        estimated_cost: 0.05,
        edit_distance: 0.1,
      }),
    ],
    [
      'replay-0003',
      observation('replay-0003', {
        intent: 'refund_request',
        effective_runtime_mode: 'assist',
        evidence_ids: ['evidence:policy'],
        tool_names: ['create_refund_request_dry_run'],
        latency_ms: 9000,
        estimated_cost: 0.15,
        edit_distance: 0.100001,
      }),
    ],
    [
      'replay-0004',
      observation('replay-0004', {
        intent: 'order_status',
        evidence_ids: [],
        tool_names: [],
        latency_ms: 3000,
        estimated_cost: 0.05,
        unsafe_action: true,
        edit_distance: 0,
      }),
    ],
  ]);
}

function replayCase(
  caseId: string,
  requiresEvidence: boolean,
  highRisk: boolean,
  tools: EvalCase['required_tool_names'],
): EvalCase {
  const intent =
    tools.includes('create_refund_request_dry_run')
      ? 'refund_request'
      : tools.includes('get_order_status')
        ? 'order_status'
        : 'return_policy';
  return {
    case_id: caseId,
    dataset_version: 'phase4-v1',
    split: 'test',
    tenant_id: tenantId,
    masked_input: `Fixture ${caseId}`,
    expected_intent: intent,
    expected_action: 'reply',
    high_risk: highRisk,
    requires_evidence: requiresEvidence,
    expected_evidence_ids: requiresEvidence ? ['evidence:policy'] : [],
    required_tool_names: tools,
    expected_runtime_ceiling: highRisk ? 'assist' : 'auto',
    max_latency_ms: 8000,
    max_cost: 0.1,
    tags: ['fixture'],
  };
}

function observation(
  caseId: string,
  overrides: Partial<BenchmarkCandidateObservation> = {},
): BenchmarkCandidateObservation {
  return {
    case_id: caseId,
    tenant_id: tenantId,
    variant: 'v3_selective_pipeline',
    variant_version: 'phase5-v1',
    intent: 'return_policy',
    action: 'reply',
    effective_runtime_mode: 'auto',
    evidence_ids: [],
    tool_names: [],
    risk_severity: 'P3',
    blocking: false,
    unsafe_action: false,
    pii_leak: false,
    unauthorized_access: false,
    latency_ms: 1000,
    estimated_cost: 0.05,
    succeeded: true,
    failure_reason: null,
    human_edit_eligible: true,
    proposed_reply_hash: 'c'.repeat(64),
    final_reply_hash: 'd'.repeat(64),
    edit_distance: 0,
    ...overrides,
  };
}

function runnerFor(
  observations: Map<string, BenchmarkCandidateObservation>,
): BenchmarkRunner {
  return new BenchmarkRunner({
    execute: (evalCase, context) => {
      const value = observations.get(evalCase.case_id);
      assert.ok(value);
      return {
        ...value,
        variant: context.variant,
        variant_version: context.variant_version,
      };
    },
  });
}

function command(cases: readonly EvalCase[]) {
  return {
    run_id: runId,
    tenant_id: tenantId,
    variant: 'v3_selective_pipeline' as const,
    variant_version: 'phase5-v1',
    dataset_version: 'phase4-v1',
    dataset_split: 'test' as const,
    config_hash: 'a'.repeat(64),
    workload_version: 'benchmark-workload-v1',
    cases,
    human_edit_distance_threshold: 0.1,
    idempotency_key: 'benchmark-v3-test',
    created_at: now,
  };
}

function benchmarkResult(
  evalCase: EvalCase,
  observed: BenchmarkCandidateObservation,
): BenchmarkCaseResult {
  return {
    result_id: '018f7f4a-7c1d-7b22-8d41-1234567890bb',
    run_id: runId,
    tenant_id: evalCase.tenant_id,
    case_id: evalCase.case_id,
    variant: observed.variant,
    passed: true,
    reason_codes: [],
    observation: observed,
    input_hash: 'e'.repeat(64),
    created_at: now,
  };
}

function hasCode(code: BenchmarkError['code']) {
  return (error: unknown) =>
    error instanceof BenchmarkError && error.code === code;
}
