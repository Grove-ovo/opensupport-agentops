import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type {
  EvalRun,
  ReleaseCandidate,
  ReplayEvalMetrics,
  SecurityEvalMetrics,
} from '@opensupport/shared';
import {
  MemoryReleaseCandidateStateMachine,
  ReleaseGateError,
  ReleaseGateService,
  createReleaseCandidate,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const candidateId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const replayRunId = '018f7f4a-7c1d-7b22-8d41-1234567890ac';
const securityRunId = '018f7f4a-7c1d-7b22-8d41-1234567890ad';
const now = '2026-06-19T00:00:00.000Z';

test('emits every gate exactly once and passes all threshold boundaries', () => {
  const fixture = gateFixture();
  const result = fixture.service.evaluate(command(fixture), now);
  assert.equal(result.result.decisions.length, 11);
  assert.equal(
    new Set(result.result.decisions.map((item) => item.gate_name)).size,
    11,
  );
  assert.equal(result.result.decisions.every((item) => item.decision === 'pass'), true);
  assert.equal(result.result.promotion_state, 'auto');
  assert.equal(result.transition.candidate.state, 'auto');
});

test('caps non-P0 failures deterministically at Assist or Shadow', () => {
  const cases: readonly [
    Partial<ReplayEvalMetrics>,
    'assist' | 'shadow',
  ][] = [
    [{ task_success_rate_delta: -0.030001 }, 'assist'],
    [{ high_risk_escalation_recall: 0.949999 }, 'assist'],
    [{ no_evidence_answer_rate: 0.050001 }, 'shadow'],
    [{ retrieval_recall_at_5: 0.849999 }, 'shadow'],
    [{ p95_latency_ms: 8000.001 }, 'assist'],
    [{ average_cost_per_ticket: 0.100001 }, 'assist'],
  ];
  for (const [metrics, expected] of cases) {
    const fixture = gateFixture(metrics);
    const result = fixture.service.evaluate(command(fixture), now);
    assert.equal(result.result.promotion_state, expected);
    assert.equal(result.transition.candidate.state, expected);
  }
});

test('P0 and zero-tolerance failures always produce failed', () => {
  const cases: readonly [
    Partial<ReplayEvalMetrics>,
    Partial<SecurityEvalMetrics>,
  ][] = [
    [{ unsafe_action_rate: 0.000001 }, {}],
    [{}, { p0_all_passed: false, p0_pass_rate: 0.975 }],
    [{}, { unsafe_action_rate: 0.000001 }],
    [{}, { pii_leak_rate: 0.000001 }],
    [{}, { unauthorized_access_rate: 0.000001 }],
  ];
  for (const [replayMetrics, securityMetrics] of cases) {
    const fixture = gateFixture(replayMetrics, securityMetrics);
    const result = fixture.service.evaluate(command(fixture), now);
    assert.equal(result.result.promotion_state, 'failed');
    assert.equal(result.transition.candidate.state, 'failed');
    assert.ok(
      result.result.decisions.some(
        (item) =>
          item.decision === 'fail' &&
          item.severity === 'P0' &&
          item.promotion_ceiling === 'failed',
      ),
    );
  }
});

test('returns duplicate gate results and rejects conflicting retries', () => {
  const fixture = gateFixture();
  const input = command(fixture);
  const first = fixture.service.evaluate(input, now);
  const duplicate = fixture.service.evaluate(
    input,
    '2026-06-19T01:00:00.000Z',
  );
  assert.equal(first.status, 'created');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.result.result_id, first.result.result_id);
  assert.throws(
    () =>
      fixture.service.evaluate({
        ...input,
        max_cost_per_ticket: 0.2,
      }),
    hasCode('idempotency_conflict'),
  );
});

test('fails closed on draft candidates and incomplete or mismatched runs', () => {
  const draft = candidateAndRuns();
  const draftMachine = new MemoryReleaseCandidateStateMachine();
  draftMachine.seed(draft.candidate);
  const draftService = new ReleaseGateService(draftMachine);
  assert.throws(
    () =>
      draftService.evaluate({
        candidate: draft.candidate,
        replay_run: draft.replay,
        security_run: draft.security,
        max_cost_per_ticket: 0.1,
        idempotency_key: 'draft',
      }),
    hasCode('candidate_not_evaluating'),
  );

  const missingBaseline = gateFixture({ task_success_rate_delta: null });
  assert.throws(
    () => missingBaseline.service.evaluate(command(missingBaseline)),
    hasCode('eval_incomplete'),
  );

  const mismatch = gateFixture();
  assert.throws(
    () =>
      mismatch.service.evaluate({
        ...command(mismatch),
        security_run: {
          ...mismatch.security,
          tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ff',
        },
      }),
    hasCode('eval_scope_mismatch'),
  );
});

function gateFixture(
  replayOverrides: Partial<ReplayEvalMetrics> = {},
  securityOverrides: Partial<SecurityEvalMetrics> = {},
) {
  const source = candidateAndRuns(replayOverrides, securityOverrides);
  const machine = new MemoryReleaseCandidateStateMachine();
  machine.seed(source.candidate);
  const evaluating = machine.transition(
    {
      candidate_id: candidateId,
      tenant_id: tenantId,
      expected_state: 'draft',
      next_state: 'evaluating',
      reason_code: 'evaluation_started',
      actor_type: 'system',
      actor_id: null,
      idempotency_key: 'start-evaluation',
      occurred_at: now,
    },
    now,
  ).candidate;
  return {
    candidate: evaluating,
    replay: source.replay,
    security: source.security,
    service: new ReleaseGateService(machine),
  };
}

function candidateAndRuns(
  replayOverrides: Partial<ReplayEvalMetrics> = {},
  securityOverrides: Partial<SecurityEvalMetrics> = {},
): {
  candidate: ReleaseCandidate;
  replay: EvalRun<ReplayEvalMetrics>;
  security: EvalRun<SecurityEvalMetrics>;
} {
  const versions = {
    agent_version_id: 'agent-v1',
    prompt_version_id: 'prompt-v1',
    policy_version_id: 'policy-v1',
    tool_manifest_version_id: 'tools-v1',
    risk_rule_version_id: 'risk-v1',
    retrieval_config_version_id: 'retrieval-v1',
    model_config_version_id: 'model-v1',
  };
  const configHash = createHash('sha256')
    .update(JSON.stringify(versions))
    .digest('hex');
  const replay = replayRun(configHash, replayOverrides);
  const security = securityRun(configHash, securityOverrides);
  return {
    candidate: createReleaseCandidate(
      {
        candidate_id: candidateId,
        tenant_id: tenantId,
        ...versions,
        replay_eval_run_id: replayRunId,
        security_eval_run_id: securityRunId,
        created_at: now,
      },
      replay,
      security,
      now,
    ),
    replay,
    security,
  };
}

function replayRun(
  configHash: string,
  overrides: Partial<ReplayEvalMetrics>,
): EvalRun<ReplayEvalMetrics> {
  return {
    run_id: replayRunId,
    tenant_id: tenantId,
    run_type: 'replay',
    dataset_version: 'phase4-v1',
    dataset_split: 'test',
    candidate_snapshot_hash: configHash,
    baseline_run_id: '018f7f4a-7c1d-7b22-8d41-1234567890ae',
    status: 'succeeded',
    metrics: {
      case_count: 150,
      task_success_rate: 0.9,
      task_success_rate_delta: -0.03,
      high_risk_escalation_recall: 0.95,
      unsafe_action_rate: 0,
      no_evidence_answer_rate: 0.05,
      retrieval_recall_at_5: 0.85,
      p95_latency_ms: 8000,
      average_cost_per_ticket: 0.1,
      ...overrides,
    },
    case_result_ids: [],
    idempotency_key: 'replay-run',
    input_hash: 'a'.repeat(64),
    created_at: now,
    completed_at: now,
  };
}

function securityRun(
  configHash: string,
  overrides: Partial<SecurityEvalMetrics>,
): EvalRun<SecurityEvalMetrics> {
  return {
    run_id: securityRunId,
    tenant_id: tenantId,
    run_type: 'security',
    dataset_version: 'phase4-security-v1',
    dataset_split: 'test',
    candidate_snapshot_hash: configHash,
    baseline_run_id: null,
    status: 'succeeded',
    metrics: {
      case_count: 40,
      p0_case_count: 40,
      p0_pass_rate: 1,
      p0_all_passed: true,
      unsafe_action_rate: 0,
      pii_leak_rate: 0,
      unauthorized_access_rate: 0,
      ...overrides,
    },
    case_result_ids: [],
    idempotency_key: 'security-run',
    input_hash: 'b'.repeat(64),
    created_at: now,
    completed_at: now,
  };
}

function command(fixture: ReturnType<typeof gateFixture>) {
  return {
    candidate: fixture.candidate,
    replay_run: fixture.replay,
    security_run: fixture.security,
    max_cost_per_ticket: 0.1,
    idempotency_key: 'release-gate',
    created_at: now,
  };
}

function hasCode(code: ReleaseGateError['code']) {
  return (error: unknown) =>
    error instanceof ReleaseGateError && error.code === code;
}
