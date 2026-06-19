import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  EvalCandidateObservation,
  EvalCase,
  EvalRun,
  ReplayEvalMetrics,
} from '@opensupport/shared';
import {
  ReplayEvalError,
  ReplayEvalRunner,
  calculateReplayMetrics,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const runId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const now = '2026-06-19T00:00:00.000Z';

test('runs replay cases and calculates all PRD metrics', async () => {
  const cases = fixtureCases();
  const observations = fixtureObservations();
  const runner = new ReplayEvalRunner({
    execute: (evalCase) => requiredObservation(observations, evalCase.case_id),
  });
  const result = await runner.run(command(cases), now);
  assert.equal(result.status, 'created');
  assert.equal(result.run.metrics.case_count, 4);
  assert.equal(result.run.metrics.task_success_rate, 0.75);
  assert.equal(result.run.metrics.high_risk_escalation_recall, 1);
  assert.equal(result.run.metrics.unsafe_action_rate, 0);
  assert.equal(result.run.metrics.no_evidence_answer_rate, 0.333333);
  assert.equal(result.run.metrics.retrieval_recall_at_5, 0.666667);
  assert.equal(result.run.metrics.p95_latency_ms, 9000);
  assert.equal(result.run.metrics.average_cost_per_ticket, 0.075);
  assert.equal(result.case_results[1]?.passed, false);
  assert.ok(
    result.case_results[1]?.reason_codes.includes('evidence_missing'),
  );
});

test('calculates immutable baseline regression delta', async () => {
  const runner = new ReplayEvalRunner({
    execute: (evalCase) =>
      requiredObservation(fixtureObservations(), evalCase.case_id),
  });
  const result = await runner.run(
    { ...command(fixtureCases()), baseline_run: baselineRun(1) },
    now,
  );
  assert.equal(result.run.metrics.task_success_rate_delta, -0.25);
  assert.equal(result.run.baseline_run_id, baselineRun(1).run_id);
});

test('returns one run for identical concurrent retries and rejects conflicts', async () => {
  const runner = new ReplayEvalRunner({
    execute: (evalCase) =>
      requiredObservation(fixtureObservations(), evalCase.case_id),
  });
  const input = command(fixtureCases());
  const [first, duplicate] = await Promise.all([
    runner.run(input, now),
    runner.run(input, now),
  ]);
  assert.equal(first.status, 'created');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(first.run.run_id, duplicate.run.run_id);
  await assert.rejects(
    runner.run({ ...input, candidate_snapshot_hash: 'b'.repeat(64) }, now),
    (error: unknown) =>
      error instanceof ReplayEvalError &&
      error.code === 'idempotency_conflict',
  );
});

test('fails closed on case, baseline, observation, and executor mismatch', async () => {
  const cases = fixtureCases();
  const runner = new ReplayEvalRunner({
    execute: (evalCase) => ({
      ...requiredObservation(fixtureObservations(), evalCase.case_id),
      tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ff',
    }),
  });
  await assert.rejects(
    runner.run(command(cases), now),
    (error: unknown) =>
      error instanceof ReplayEvalError && error.code === 'scope_mismatch',
  );

  const failedRunner = new ReplayEvalRunner({
    execute: () => {
      throw new Error('provider failed');
    },
  });
  await assert.rejects(
    failedRunner.run(command(cases), now),
    (error: unknown) =>
      error instanceof ReplayEvalError && error.code === 'executor_failed',
  );

  assert.throws(
    () =>
      calculateReplayMetrics(cases, [], null),
    (error: unknown) =>
      error instanceof ReplayEvalError && error.code === 'invalid_command',
  );
});

function fixtureCases(): EvalCase[] {
  return [
    replayCase('replay-0001', 'return_policy', 'reply', true, false),
    replayCase('replay-0002', 'return_policy', 'reply', true, false),
    replayCase('replay-0003', 'refund_request', 'reply', true, true),
    replayCase('replay-0004', 'order_status', 'reply', false, false),
  ];
}

function fixtureObservations(): Map<string, EvalCandidateObservation> {
  return new Map([
    [
      'replay-0001',
      observation('replay-0001', {
        evidence_ids: ['evidence:policy'],
        latency_ms: 1000,
        estimated_cost: 0.05,
      }),
    ],
    [
      'replay-0002',
      observation('replay-0002', {
        evidence_ids: [],
        latency_ms: 2000,
        estimated_cost: 0.05,
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
      }),
    ],
    [
      'replay-0004',
      observation('replay-0004', {
        intent: 'order_status',
        evidence_ids: [],
        tool_names: ['get_order_status'],
        latency_ms: 3000,
        estimated_cost: 0.05,
      }),
    ],
  ]);
}

function replayCase(
  caseId: string,
  intent: EvalCase['expected_intent'],
  action: EvalCase['expected_action'],
  requiresEvidence: boolean,
  highRisk: boolean,
): EvalCase {
  return {
    case_id: caseId,
    dataset_version: 'phase4-v1',
    split: 'test',
    tenant_id: tenantId,
    masked_input: `Fixture ${caseId}`,
    expected_intent: intent,
    expected_action: action,
    high_risk: highRisk,
    requires_evidence: requiresEvidence,
    expected_evidence_ids: requiresEvidence ? ['evidence:policy'] : [],
    required_tool_names:
      intent === 'refund_request'
        ? ['create_refund_request_dry_run']
        : intent === 'order_status'
          ? ['get_order_status']
          : [],
    expected_runtime_ceiling: highRisk ? 'assist' : 'auto',
    max_latency_ms: 8000,
    max_cost: 0.1,
    tags: ['fixture'],
  };
}

function observation(
  caseId: string,
  overrides: Partial<EvalCandidateObservation>,
): EvalCandidateObservation {
  return {
    case_id: caseId,
    tenant_id: tenantId,
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
    ...overrides,
  };
}

function requiredObservation(
  observations: Map<string, EvalCandidateObservation>,
  caseId: string,
) {
  const value = observations.get(caseId);
  assert.ok(value);
  return value;
}

function command(cases: EvalCase[]) {
  return {
    run_id: runId,
    tenant_id: tenantId,
    dataset_version: 'phase4-v1',
    dataset_split: 'test' as const,
    candidate_snapshot_hash: 'a'.repeat(64),
    cases,
    baseline_run: null,
    idempotency_key: 'replay-test-run',
    created_at: now,
  };
}

function baselineRun(taskSuccessRate: number): EvalRun<ReplayEvalMetrics> {
  return {
    run_id: '018f7f4a-7c1d-7b22-8d41-1234567890ac',
    tenant_id: tenantId,
    run_type: 'replay',
    dataset_version: 'phase4-v0',
    dataset_split: 'test',
    candidate_snapshot_hash: 'c'.repeat(64),
    baseline_run_id: null,
    status: 'succeeded',
    metrics: {
      case_count: 4,
      task_success_rate: taskSuccessRate,
      task_success_rate_delta: null,
      high_risk_escalation_recall: 1,
      unsafe_action_rate: 0,
      no_evidence_answer_rate: 0,
      retrieval_recall_at_5: 1,
      p95_latency_ms: 1000,
      average_cost_per_ticket: 0.05,
    },
    case_result_ids: [],
    idempotency_key: 'baseline',
    input_hash: 'd'.repeat(64),
    created_at: now,
    completed_at: now,
  };
}
