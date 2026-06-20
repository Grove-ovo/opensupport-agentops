import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  EvalCaseResult,
  ReleaseGateDecision,
  ReleaseGateResult,
} from '@opensupport/shared';
import {
  FailureMaterializationError,
  classifyFailureBucket,
  materializeFailureCases,
} from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const candidateId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const runId = '018f7f4a-7c1d-7b22-8d41-1234567890ac';
const resultId = '018f7f4a-7c1d-7b22-8d41-1234567890ad';
const gateResultId = '018f7f4a-7c1d-7b22-8d41-1234567890ae';
const now = '2026-06-19T00:00:00.000Z';

test('classifies all stable failure buckets with deterministic precedence', () => {
  assert.equal(classifyFailureBucket('pii_leak', null, 'replay'), 'security');
  assert.equal(classifyFailureBucket('evidence_missing', null, 'replay'), 'grounding');
  assert.equal(classifyFailureBucket('gate', 'retrieval_recall_at_5', null), 'retrieval');
  assert.equal(classifyFailureBucket('tool_result_missing', null, 'replay'), 'tool');
  assert.equal(classifyFailureBucket('gate', 'high_risk_escalation_recall', null), 'risk');
  assert.equal(classifyFailureBucket('latency_exceeded', null, 'replay'), 'latency');
  assert.equal(classifyFailureBucket('cost_exceeded', null, 'replay'), 'cost');
  assert.equal(classifyFailureBucket('gate', 'task_success_regression', null), 'regression');
  assert.equal(classifyFailureBucket('intent_mismatch', null, 'replay'), 'quality');
  assert.equal(classifyFailureBucket('candidate_failed', null, 'replay'), 'infrastructure');
});

test('materializes failed case and gate reasons without payload fields', () => {
  const failures = materializeFailureCases(
    {
      tenant_id: tenantId,
      candidate_id: candidateId,
      eval_case_results: [evalResult()],
      release_gate_result: gateResult(),
    },
    now,
  );
  assert.equal(failures.length, 4);
  assert.deepEqual(
    failures.map((failure) => failure.bucket),
    ['cost', 'grounding', 'latency', 'retrieval'],
  );
  const serialized = JSON.stringify(failures);
  for (const forbidden of [
    'masked_input',
    'suggested_reply',
    'evidence_ids',
    'tool_names',
    'api_key',
    'provider_payload',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(Object.isFrozen(failures), true);
  assert.equal(failures.every((failure) => Object.isFrozen(failure)), true);
});

test('ignores passed results and decisions', () => {
  const passedResult = { ...evalResult(), passed: true, reason_codes: [] };
  const passedGate = gateResult();
  const passedDecision = {
    ...passedGate.decisions[0]!,
    decision: 'pass' as const,
    reason_code: 'within_threshold' as const,
    blocking: false,
    promotion_ceiling: 'auto' as const,
  };
  const failures = materializeFailureCases({
    tenant_id: tenantId,
    candidate_id: candidateId,
    eval_case_results: [passedResult],
    release_gate_result: {
      ...passedGate,
      decisions: [passedDecision],
    },
  });
  assert.equal(failures.length, 0);
});

test('rejects cross-tenant eval and gate scope', () => {
  assert.throws(
    () =>
      materializeFailureCases({
        tenant_id: tenantId,
        candidate_id: candidateId,
        eval_case_results: [
          {
            ...evalResult(),
            tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ff',
          },
        ],
        release_gate_result: gateResult(),
      }),
    (error: unknown) =>
      error instanceof FailureMaterializationError &&
      error.code === 'scope_mismatch',
  );
});

function evalResult(): EvalCaseResult {
  return {
    result_id: resultId,
    run_id: runId,
    tenant_id: tenantId,
    case_id: 'replay-0001',
    case_kind: 'replay',
    passed: false,
    reason_codes: ['evidence_missing', 'latency_exceeded', 'cost_exceeded'],
    observation: {
      case_id: 'replay-0001',
      tenant_id: tenantId,
      intent: 'return_policy',
      action: 'reply',
      effective_runtime_mode: 'shadow',
      evidence_ids: ['not-persisted'],
      tool_names: ['get_order_status'],
      risk_severity: 'P1',
      blocking: true,
      unsafe_action: false,
      pii_leak: false,
      unauthorized_access: false,
      latency_ms: 9000,
      estimated_cost: 0.2,
      succeeded: true,
      failure_reason: null,
    },
    input_hash: 'a'.repeat(64),
    created_at: now,
  };
}

function gateResult(): ReleaseGateResult {
  const decision: ReleaseGateDecision = {
    decision_id: '018f7f4a-7c1d-7b22-8d41-1234567890af',
    result_id: gateResultId,
    candidate_id: candidateId,
    tenant_id: tenantId,
    gate_name: 'retrieval_recall_at_5',
    decision: 'fail',
    actual_value: 0.8,
    threshold_operator: 'gte',
    threshold_value: 0.85,
    reason_code: 'retrieval_recall_below_threshold',
    severity: 'P1',
    blocking: true,
    promotion_ceiling: 'shadow',
    input_hash: 'b'.repeat(64),
    created_at: now,
  };
  return {
    result_id: gateResultId,
    candidate_id: candidateId,
    tenant_id: tenantId,
    candidate_snapshot_hash: 'c'.repeat(64),
    replay_eval_run_id: runId,
    security_eval_run_id: '018f7f4a-7c1d-7b22-8d41-1234567890b0',
    decisions: [decision],
    promotion_state: 'shadow',
    idempotency_key: 'gate-result',
    input_hash: 'd'.repeat(64),
    created_at: now,
  };
}
