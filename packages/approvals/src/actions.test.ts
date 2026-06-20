import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ApprovalAction,
  ApprovalActionCommand,
  CreateApprovalCommand,
} from '@opensupport/shared';
import {
  ChatwootDeliveryService,
  type ChatwootTransport,
  type ChatwootTransportRequest,
} from '@opensupport/chatwoot';
import { MemoryTicketExecutionStateMachine } from '@opensupport/runtime-control';
import {
  ApprovalActionError,
  ApprovalActionService,
  normalizedEditDistance,
} from './actions.js';
import { MemoryApprovalRepository } from './snapshot.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const traceId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const approvalId = '018f7f4a-7c1d-7b22-8d41-1234567890ac';
const now = '2026-06-19T00:00:00.000Z';

test('applies every terminal action and maps ticket states', async () => {
  for (const [action, expectedApproval, expectedTicket] of [
    ['approve', 'approved', 'replied'],
    ['edit', 'edited', 'replied'],
    ['reject', 'rejected', 'private_noted'],
    ['escalate', 'escalated', 'handed_off'],
    ['expire', 'expired', 'handed_off'],
  ] as const) {
    const context = setup();
    const result = await context.actions.apply(
      actionCommand(action),
      action === 'approve' || action === 'edit' ? connection : null,
      action === 'expire' ? '2026-06-19T01:01:00.000Z' : now,
    );
    assert.equal(result.approval.state, expectedApproval);
    assert.equal(
      context.stateMachine.getSnapshot(traceId)?.execution_state,
      expectedTicket,
    );
    assert.equal(
      context.transport.requests.length,
      action === 'approve' || action === 'edit' ? 1 : 0,
    );
  }
});

test('retains original and edited replies with normalized distance', async () => {
  const context = setup();
  const result = await context.actions.apply(
    actionCommand('edit'),
    connection,
    now,
  );
  assert.equal(result.approval.snapshot.suggested_reply, 'Original reply');
  assert.equal(result.action.edited_reply, 'Edited reply');
  assert.equal(
    result.action.edit_distance,
    normalizedEditDistance('Original reply', 'Edited reply'),
  );
  assert.equal(result.delivery_receipt?.status, 'succeeded');
});

test('returns duplicate action result and rejects conflicts or late actions', async () => {
  const context = setup();
  const command = actionCommand('approve');
  const first = await context.actions.apply(command, connection, now);
  const duplicate = await context.actions.apply(command, connection, now);
  assert.equal(first.status, 'applied');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(context.transport.requests.length, 1);

  await assert.rejects(
    context.actions.apply(
      { ...command, action: 'reject', delivery_id: null, conversation_id: null, deadline_at: null },
      null,
      now,
    ),
    (error: unknown) =>
      error instanceof ApprovalActionError &&
      error.code === 'idempotency_conflict',
  );

  const late = setup();
  await assert.rejects(
    late.actions.apply(
      {
        ...actionCommand('approve'),
        occurred_at: '2026-06-19T01:00:00.000Z',
        deadline_at: '2026-06-19T02:00:00.000Z',
      },
      connection,
      now,
    ),
    (error: unknown) =>
      error instanceof ApprovalActionError && error.code === 'late_action',
  );
});

test('failed delivery leaves approval pending and permits idempotent retry', async () => {
  const context = setup(503);
  const command = actionCommand('approve');
  await assert.rejects(
    context.actions.apply(command, connection, now),
    (error: unknown) =>
      error instanceof ApprovalActionError &&
      error.code === 'delivery_failed',
  );
  assert.equal(
    context.approvals.findPending(tenantId, traceId)?.state,
    'pending',
  );
  assert.equal(
    context.stateMachine.getSnapshot(traceId)?.execution_state,
    'waiting_approval',
  );
  context.transport.status = 200;
  const retry = await context.actions.apply(command, connection, now);
  assert.equal(retry.status, 'applied');
  assert.equal(context.transport.requests.length, 2);
  assert.equal(retry.delivery_receipt?.status, 'succeeded');
});

test('reject, escalate, and expire reject any public delivery fields', async () => {
  for (const action of ['reject', 'escalate', 'expire'] as const) {
    const context = setup();
    await assert.rejects(
      context.actions.apply(
        {
          ...actionCommand(action),
          delivery_id: '018f7f4a-7c1d-7b22-8d41-1234567890ae',
          conversation_id: '1001',
          deadline_at: '2026-06-19T00:01:00.000Z',
        },
        connection,
        now,
      ),
      (error: unknown) =>
        error instanceof ApprovalActionError &&
        error.code === 'invalid_command',
    );
    assert.equal(context.transport.requests.length, 0);
  }
});

class FakeTransport implements ChatwootTransport {
  readonly requests: ChatwootTransportRequest[] = [];

  constructor(public status = 200) {}

  async send(request: ChatwootTransportRequest) {
    this.requests.push(request);
    return { status: this.status, body: { id: 9001 } };
  }
}

function setup(status = 200) {
  const stateMachine = new MemoryTicketExecutionStateMachine();
  stateMachine.seed({
    tenant_id: tenantId,
    trace_id: traceId,
    execution_state: 'planned',
  });
  const approvals = new MemoryApprovalRepository(stateMachine);
  approvals.create(createCommand(), now);
  const transport = new FakeTransport(status);
  const delivery = new ChatwootDeliveryService(transport, {
    resolve: () => 'plaintext-token',
  });
  return {
    stateMachine,
    approvals,
    transport,
    actions: new ApprovalActionService(approvals, delivery),
  };
}

function createCommand(): CreateApprovalCommand {
  return {
    approval_id: approvalId,
    tenant_id: tenantId,
    trace_id: traceId,
    expected_state: 'planned',
    suggested_reply: 'Original reply',
    evidence_refs: ['evidence:policy'],
    tool_result_refs: [],
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
    idempotency_key: 'create-approval',
    created_at: now,
  };
}

function actionCommand(action: ApprovalAction): ApprovalActionCommand {
  const deliveryAction = action === 'approve' || action === 'edit';
  return {
    action_id: '018f7f4a-7c1d-7b22-8d41-1234567890ad',
    approval_id: approvalId,
    tenant_id: tenantId,
    trace_id: traceId,
    expected_state: 'pending',
    action,
    actor_type: action === 'expire' ? 'scheduler' : 'operator',
    actor_id: action === 'expire' ? null : 'operator-1',
    edited_reply: action === 'edit' ? 'Edited reply' : null,
    conversation_id: deliveryAction ? '1001' : null,
    delivery_id: deliveryAction
      ? '018f7f4a-7c1d-7b22-8d41-1234567890ae'
      : null,
    deadline_at: deliveryAction ? '2026-06-19T00:01:00.000Z' : null,
    idempotency_key: `action-${action}`,
    occurred_at: action === 'expire' ? '2026-06-19T01:01:00.000Z' : now,
  };
}

const connection = {
  tenant_id: tenantId,
  base_url: 'https://chatwoot.example.com',
  account_id: 42,
  api_token_ref: 'secret://chatwoot',
};
