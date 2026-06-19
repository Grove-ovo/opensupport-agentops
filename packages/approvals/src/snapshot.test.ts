import assert from 'node:assert/strict';
import test from 'node:test';
import type { CreateApprovalCommand } from '@opensupport/shared';
import { MemoryTicketExecutionStateMachine } from '@opensupport/runtime-control';
import {
  ApprovalCreationError,
  MemoryApprovalRepository,
} from './snapshot.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const traceId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';

test('creates one immutable pending approval and moves ticket atomically', () => {
  const { approvals, stateMachine } = repository();
  const result = approvals.create(command(), now);
  assert.equal(result.status, 'created');
  assert.equal(result.approval.state, 'pending');
  assert.equal(result.transition.reason_code, 'approval_required');
  assert.equal(result.transition.to_state, 'waiting_approval');
  assert.equal(
    stateMachine.getSnapshot(traceId)?.execution_state,
    'waiting_approval',
  );
  assert.equal(Object.isFrozen(result.approval.snapshot), true);
  assert.equal(Object.isFrozen(result.approval.snapshot.evidence_refs), true);
});

test('returns the same approval for idempotent and semantic duplicates', () => {
  const { approvals } = repository();
  const first = approvals.create(command(), now);
  const sameKey = approvals.create(command(), now);
  const semanticRetry = approvals.create(
    {
      ...command(),
      approval_id: '018f7f4a-7c1d-7b22-8d41-1234567890ad',
      idempotency_key: 'approval-semantic-retry',
    },
    now,
  );
  assert.equal(sameKey.status, 'duplicate');
  assert.equal(semanticRetry.status, 'duplicate');
  assert.equal(sameKey.approval.approval_id, first.approval.approval_id);
  assert.equal(semanticRetry.approval.approval_id, first.approval.approval_id);
  assert.equal(
    sameKey.transition.transition_id,
    first.transition.transition_id,
  );
  assert.equal(
    semanticRetry.transition.transition_id,
    first.transition.transition_id,
  );
});

test('rejects changed snapshots and invalid tenant scope without transition', () => {
  const { approvals, stateMachine } = repository();
  approvals.create(command(), now);
  assert.throws(
    () =>
      approvals.create(
        { ...command(), suggested_reply: 'Different reply' },
        now,
      ),
    (error: unknown) =>
      error instanceof ApprovalCreationError &&
      error.code === 'idempotency_conflict',
  );

  const unseeded = new MemoryApprovalRepository(stateMachine);
  assert.throws(
    () =>
      unseeded.create(
        {
          ...command(),
          tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890ae',
          idempotency_key: 'cross-tenant',
        },
        now,
      ),
    (error: unknown) =>
      error instanceof ApprovalCreationError &&
      error.code === 'ticket_transition_failed',
  );
});

test('requires grounded references, complete versions, and future expiry', () => {
  const { approvals } = repository();
  for (const invalid of [
    { ...command(), evidence_refs: [], tool_result_refs: [] },
    {
      ...command(),
      version_snapshot: { ...command().version_snapshot, agent_version_id: '' },
    },
    { ...command(), expires_at: now },
  ]) {
    assert.throws(
      () => approvals.create(invalid, now),
      (error: unknown) =>
        error instanceof ApprovalCreationError &&
        error.code === 'invalid_command',
    );
  }
});

function repository() {
  const stateMachine = new MemoryTicketExecutionStateMachine();
  stateMachine.seed({
    tenant_id: tenantId,
    trace_id: traceId,
    execution_state: 'planned',
  });
  return {
    stateMachine,
    approvals: new MemoryApprovalRepository(stateMachine),
  };
}

function command(): CreateApprovalCommand {
  return {
    approval_id: '018f7f4a-7c1d-7b22-8d41-1234567890ac',
    tenant_id: tenantId,
    trace_id: traceId,
    expected_state: 'planned',
    suggested_reply: 'Your order is in transit.',
    evidence_refs: ['evidence:shipping-policy'],
    tool_result_refs: ['tool-result:order-status'],
    risk_reason: 'P3:safe',
    generated_action: 'public_reply',
    version_snapshot: {
      agent_version_id: 'agent-v1',
      prompt_version_id: 'prompt-v1',
      policy_version_id: 'policy-v1',
      tool_manifest_version_id: 'tools-v1',
      risk_rule_version_id: 'risk-v1',
      retrieval_config_version_id: 'retrieval-v1',
      model_config_version_id: '018f7f4a-7c1d-7b22-8d41-1234567890af',
    },
    expires_at: '2026-06-19T01:00:00.000Z',
    idempotency_key: 'approval-create',
    created_at: now,
  };
}

const now = '2026-06-19T00:00:00.000Z';
