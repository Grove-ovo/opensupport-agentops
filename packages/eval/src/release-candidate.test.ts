import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type {
  EvalRun,
  ReleaseCandidateReasonCode,
  ReleaseCandidateState,
  ReplayEvalMetrics,
  SecurityEvalMetrics,
} from '@opensupport/shared';
import {
  MemoryReleaseCandidateStateMachine,
  ReleaseCandidateError,
  createReleaseCandidate,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const candidateId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const replayRunId = '018f7f4a-7c1d-7b22-8d41-1234567890ac';
const securityRunId = '018f7f4a-7c1d-7b22-8d41-1234567890ad';
const now = '2026-06-19T00:00:00.000Z';

test('freezes seven config versions and exact eval runs', () => {
  const candidate = candidateFixture();
  assert.equal(Object.isFrozen(candidate), true);
  assert.equal(Object.isFrozen(candidate.snapshot), true);
  assert.equal(candidate.state, 'draft');
  assert.equal(candidate.snapshot.replay_eval_run_id, replayRunId);
  assert.equal(candidate.snapshot.security_eval_run_id, securityRunId);
  assert.match(candidate.snapshot.config_snapshot_hash, /^[a-f0-9]{64}$/u);
  assert.match(candidate.snapshot.snapshot_hash, /^[a-f0-9]{64}$/u);
});

test('applies every valid release candidate path', () => {
  for (const target of ['failed', 'shadow', 'assist', 'auto'] as const) {
    const machine = new MemoryReleaseCandidateStateMachine();
    machine.seed(candidateFixture());
    const evaluating = machine.transition(
      transition('draft', 'evaluating', 'evaluation_started', `${target}-1`),
      now,
    );
    assert.equal(evaluating.candidate.state, 'evaluating');
    const promoted = machine.transition(
      transition(
        'evaluating',
        target,
        reasonForTarget(target),
        `${target}-2`,
      ),
      now,
    );
    assert.equal(promoted.candidate.state, target);
    const archived = machine.transition(
      transition(target, 'archived', 'candidate_archived', `${target}-3`),
      now,
    );
    assert.equal(archived.candidate.state, 'archived');
  }
});

test('returns duplicates and rejects conflicting retries', () => {
  const machine = new MemoryReleaseCandidateStateMachine();
  machine.seed(candidateFixture());
  const input = transition(
    'draft',
    'evaluating',
    'evaluation_started',
    'same-key',
  );
  const first = machine.transition(input, now);
  const duplicate = machine.transition(input, '2026-06-19T01:00:00.000Z');
  assert.equal(first.status, 'applied');
  assert.equal(duplicate.status, 'duplicate');
  assert.deepEqual(duplicate.transition, first.transition);
  assert.throws(
    () =>
      machine.transition({
        ...input,
        actor_id: 'different',
      }),
    hasCode('idempotency_conflict'),
  );
});

test('rejects stale, invalid, terminal, and cross-scope transitions', () => {
  const machine = new MemoryReleaseCandidateStateMachine();
  machine.seed(candidateFixture());
  assert.throws(
    () =>
      machine.transition(
        transition('evaluating', 'auto', 'promoted_auto', 'stale'),
      ),
    hasCode('stale_state'),
  );
  assert.throws(
    () =>
      machine.transition(
        transition('draft', 'auto', 'promoted_auto', 'invalid'),
      ),
    hasCode('invalid_transition'),
  );
  assert.throws(
    () =>
      machine.transition({
        ...transition(
          'draft',
          'evaluating',
          'evaluation_started',
          'scope',
        ),
        tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ff',
      }),
    hasCode('cross_scope'),
  );
  machine.transition(
    transition('draft', 'evaluating', 'evaluation_started', 'terminal-1'),
  );
  machine.transition(
    transition('evaluating', 'auto', 'promoted_auto', 'terminal-2'),
  );
  machine.transition(
    transition('auto', 'archived', 'candidate_archived', 'terminal-3'),
  );
  assert.throws(
    () =>
      machine.transition(
        transition(
          'archived',
          'evaluating',
          'evaluation_started',
          'terminal-4',
        ),
      ),
    hasCode('terminal_state'),
  );
});

test('rejects mismatched tenant, run type, status, and candidate hash', () => {
  const command = createCommand();
  const replay = evalRun('replay', replayRunId);
  const security = evalRun('security', securityRunId);
  assert.throws(
    () =>
      createReleaseCandidate(
        command,
        { ...replay, tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ff' },
        security,
      ),
    hasCode('eval_scope_mismatch'),
  );
  assert.throws(
    () =>
      createReleaseCandidate(
        command,
        { ...replay, run_type: 'security' },
        security,
      ),
    hasCode('eval_scope_mismatch'),
  );
  assert.throws(
    () =>
      createReleaseCandidate(
        command,
        replay,
        { ...security, candidate_snapshot_hash: 'f'.repeat(64) },
      ),
    hasCode('eval_scope_mismatch'),
  );
});

function candidateFixture() {
  const command = createCommand();
  return createReleaseCandidate(
    command,
    evalRun('replay', replayRunId),
    evalRun('security', securityRunId),
    now,
  );
}

function createCommand() {
  return {
    candidate_id: candidateId,
    tenant_id: tenantId,
    agent_version_id: 'agent-v1',
    prompt_version_id: 'prompt-v1',
    policy_version_id: 'policy-v1',
    tool_manifest_version_id: 'tools-v1',
    risk_rule_version_id: 'risk-v1',
    retrieval_config_version_id: 'retrieval-v1',
    model_config_version_id: 'model-v1',
    replay_eval_run_id: replayRunId,
    security_eval_run_id: securityRunId,
    created_at: now,
  };
}

function evalRun(
  runType: 'replay',
  runId: string,
): EvalRun<ReplayEvalMetrics>;
function evalRun(
  runType: 'security',
  runId: string,
): EvalRun<SecurityEvalMetrics>;
function evalRun(
  runType: 'replay' | 'security',
  runId: string,
): EvalRun<ReplayEvalMetrics | SecurityEvalMetrics> {
  const candidate = createCommand();
  const candidateHash = createHash('sha256')
    .update(
      JSON.stringify({
        agent_version_id: candidate.agent_version_id,
        prompt_version_id: candidate.prompt_version_id,
        policy_version_id: candidate.policy_version_id,
        tool_manifest_version_id: candidate.tool_manifest_version_id,
        risk_rule_version_id: candidate.risk_rule_version_id,
        retrieval_config_version_id: candidate.retrieval_config_version_id,
        model_config_version_id: candidate.model_config_version_id,
      }),
    )
    .digest('hex');
  return {
    run_id: runId,
    tenant_id: tenantId,
    run_type: runType,
    dataset_version: `${runType}-v1`,
    dataset_split: 'test',
    candidate_snapshot_hash: candidateHash,
    baseline_run_id: null,
    status: 'succeeded',
    metrics:
      runType === 'replay'
        ? {
            case_count: 1,
            task_success_rate: 1,
            task_success_rate_delta: 0,
            high_risk_escalation_recall: 1,
            unsafe_action_rate: 0,
            no_evidence_answer_rate: 0,
            retrieval_recall_at_5: 1,
            p95_latency_ms: 100,
            average_cost_per_ticket: 0.01,
          }
        : {
            case_count: 1,
            p0_case_count: 1,
            p0_pass_rate: 1,
            p0_all_passed: true,
            unsafe_action_rate: 0,
            pii_leak_rate: 0,
            unauthorized_access_rate: 0,
          },
    case_result_ids: [],
    idempotency_key: `${runType}-run`,
    input_hash: 'a'.repeat(64),
    created_at: now,
    completed_at: now,
  };
}

function transition(
  expected: ReleaseCandidateState,
  next: ReleaseCandidateState,
  reason: ReleaseCandidateReasonCode,
  key: string,
) {
  return {
    candidate_id: candidateId,
    tenant_id: tenantId,
    expected_state: expected,
    next_state: next,
    reason_code: reason,
    actor_type: 'system' as const,
    actor_id: null,
    idempotency_key: key,
    occurred_at: now,
  };
}

function reasonForTarget(
  target: Exclude<ReleaseCandidateState, 'draft' | 'evaluating' | 'archived'>,
): ReleaseCandidateReasonCode {
  return target === 'failed'
    ? 'evaluation_failed'
    : (`promoted_${target}` as ReleaseCandidateReasonCode);
}

function hasCode(code: ReleaseCandidateError['code']) {
  return (error: unknown) =>
    error instanceof ReleaseCandidateError && error.code === code;
}
