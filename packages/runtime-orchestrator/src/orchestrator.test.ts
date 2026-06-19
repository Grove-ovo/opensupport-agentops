import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AgentPipelineRun,
  ApprovalActionCommand,
  RuntimeMode,
  RuntimeModeConfig,
  TraceVersionSnapshot,
} from '@opensupport/shared';
import {
  ChatwootDeliveryService,
  type ChatwootTransport,
  type ChatwootTransportRequest,
} from '@opensupport/chatwoot';
import {
  ApprovalActionError,
  ApprovalActionService,
  MemoryApprovalRepository,
} from '@opensupport/approvals';
import { MemoryTicketExecutionStateMachine } from '@opensupport/runtime-control';
import {
  RuntimeOrchestrator,
  RuntimeOrchestratorError,
} from './orchestrator.js';
import type { RuntimeExecutionCommand } from './types.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const traceId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';
const now = '2026-06-19T00:00:00.000Z';

test('Shadow writes one private note and never a public reply', async () => {
  const context = setup();
  const result = await context.orchestrator.execute(
    command('shadow'),
    connection,
    now,
  );
  assert.equal(result.outcome, 'private_noted');
  assert.equal(result.decision.effective_mode, 'shadow');
  assert.equal(result.delivery_receipt?.message_type, 'private_note');
  assert.equal(context.transport.requests.length, 1);
  assert.equal(context.transport.requests[0]?.body.private, true);
  assert.equal(
    context.stateMachine.getSnapshot(traceId)?.execution_state,
    'private_noted',
  );
});

test('Assist creates one immutable approval without public delivery', async () => {
  const context = setup();
  const input = command('assist');
  const first = await context.orchestrator.execute(input, connection, now);
  const duplicate = await context.orchestrator.execute(input, connection, now);
  assert.equal(first.outcome, 'approval_pending');
  assert.equal(first.approval?.state, 'pending');
  assert.deepEqual(first.approval?.snapshot.evidence_refs, [
    'evidence:return-policy',
  ]);
  assert.equal(first.transition.to_state, 'waiting_approval');
  assert.equal(first.audit.approval_id, first.approval?.approval_id);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.transition.transition_id, first.transition.transition_id);
  assert.equal(context.transport.requests.length, 0);
  assert.equal(
    context.stateMachine.getSnapshot(traceId)?.execution_state,
    'waiting_approval',
  );
});

test('Auto sends one low-risk grounded public reply and records audit refs', async () => {
  const context = setup();
  const result = await context.orchestrator.execute(
    command('auto'),
    connection,
    now,
  );
  assert.equal(result.outcome, 'replied');
  assert.equal(result.decision.action, 'public_reply');
  assert.equal(result.delivery_receipt?.status, 'succeeded');
  assert.equal(context.transport.requests[0]?.body.private, false);
  assert.equal(result.audit.runtime_decision_id, result.decision.decision_id);
  assert.equal(result.audit.transition_id, result.transition.transition_id);
  assert.equal(
    result.audit.delivery_receipt_id,
    result.delivery_receipt?.receipt_id,
  );
  assert.equal(result.audit.estimated_cost, 0.01);
  assert.equal(result.audit.latency_ms, 1000);
});

test('concurrent duplicate Auto execution produces one Chatwoot message', async () => {
  const context = setup();
  const input = command('auto');
  const [first, duplicate] = await Promise.all([
    context.orchestrator.execute(input, connection, now),
    context.orchestrator.execute(input, connection, now),
  ]);
  assert.equal(first.outcome, 'replied');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(context.transport.requests.length, 1);
});

test('different execution keys cannot concurrently claim the same trace', async () => {
  const context = setup();
  const first = command('auto');
  const conflicting = {
    ...command('auto'),
    idempotency_key: 'different-runtime-key',
    delivery_id: '018f7f4a-7c1d-7b22-8d41-1234567890ba',
  };
  const results = await Promise.allSettled([
    context.orchestrator.execute(first, connection, now),
    context.orchestrator.execute(conflicting, connection, now),
  ]);
  assert.equal(results[0]?.status, 'fulfilled');
  assert.equal(results[1]?.status, 'rejected');
  assert.equal(
    results[1]?.status === 'rejected' &&
      results[1].reason instanceof RuntimeOrchestratorError
      ? results[1].reason.code
      : null,
    'idempotency_conflict',
  );
  assert.equal(context.transport.requests.length, 1);
});

test('stale expected state is rejected before any side effect', async () => {
  const context = setup();
  await assert.rejects(
    context.orchestrator.execute(
      { ...command('auto'), expected_state: 'waiting_tool' },
      connection,
      now,
    ),
    (error: unknown) =>
      error instanceof RuntimeOrchestratorError &&
      error.code === 'state_transition_failed',
  );
  assert.equal(context.transport.requests.length, 0);
  assert.equal(
    context.stateMachine.getSnapshot(traceId)?.execution_state,
    'planned',
  );
});

test('P0 risk and missing grounding never produce a public reply', async () => {
  const riskyContext = setup();
  const risky = command('auto');
  risky.pipeline.risk = {
    ...risky.pipeline.risk,
    blocking: true,
    highest_severity: 'P0',
    recommendation: 'handoff',
  };
  const blocked = await riskyContext.orchestrator.execute(
    risky,
    connection,
    now,
  );
  assert.equal(blocked.outcome, 'handed_off');
  assert.ok(blocked.audit.reason_codes.includes('risk_blocking'));
  assert.equal(riskyContext.transport.requests.length, 0);

  const groundingContext = setup();
  const ungrounded = command('auto');
  ungrounded.pipeline.response = {
    ...ungrounded.pipeline.response,
    grounded: false,
    evidence_refs: [],
  };
  const downgraded = await groundingContext.orchestrator.execute(
    ungrounded,
    connection,
    now,
  );
  assert.equal(downgraded.outcome, 'private_noted');
  assert.equal(downgraded.decision.effective_mode, 'shadow');
  assert.ok(downgraded.audit.reason_codes.includes('grounding_missing'));
  assert.equal(groundingContext.transport.requests[0]?.body.private, true);
});

test('ticket cost cap downgrades Auto and records a stable reason', async () => {
  const context = setup();
  const expensive = command('auto');
  expensive.pipeline.trace_append = {
    ...expensive.pipeline.trace_append,
    estimated_cost: 0.5,
  };
  const result = await context.orchestrator.execute(
    expensive,
    connection,
    now,
  );
  assert.equal(result.outcome, 'approval_pending');
  assert.equal(result.decision.effective_mode, 'assist');
  assert.ok(result.audit.reason_codes.includes('ticket_budget_exceeded'));
  assert.equal(context.transport.requests.length, 0);
});

test('high-risk tool work requires approval and failed tool results block it', async () => {
  const approvalContext = setup();
  const highRisk = command('auto');
  highRisk.pipeline = refundPipeline('succeeded');
  highRisk.runtime_config = {
    ...highRisk.runtime_config,
    allowed_auto_intents: ['return_policy', 'refund_request'],
  };
  const approval = await approvalContext.orchestrator.execute(
    highRisk,
    connection,
    now,
  );
  assert.equal(approval.outcome, 'approval_pending');
  assert.equal(approval.decision.effective_mode, 'assist');
  assert.ok(
    approval.audit.reason_codes.includes('risk_above_auto_threshold'),
  );
  assert.equal(approvalContext.transport.requests.length, 0);

  const failedContext = setup();
  const failedTool = command('auto');
  failedTool.pipeline = refundPipeline('failed');
  failedTool.runtime_config = {
    ...failedTool.runtime_config,
    allowed_auto_intents: ['return_policy', 'refund_request'],
  };
  const blocked = await failedContext.orchestrator.execute(
    failedTool,
    connection,
    now,
  );
  assert.equal(blocked.outcome, 'private_noted');
  assert.equal(blocked.decision.effective_mode, 'shadow');
  assert.ok(blocked.audit.reason_codes.includes('grounding_missing'));
  assert.equal(failedContext.transport.requests[0]?.body.private, true);
});

test('delivery failure closes the ticket without claiming a reply', async () => {
  const context = setup(503);
  const result = await context.orchestrator.execute(
    command('auto'),
    connection,
    now,
  );
  assert.equal(result.outcome, 'failed');
  assert.equal(result.delivery_receipt?.code, 'retryable_error');
  assert.equal(result.transition.reason_code, 'delivery_failed');
  assert.equal(result.audit.failure_reason, 'retryable_error');
  assert.equal(
    context.stateMachine.getSnapshot(traceId)?.execution_state,
    'failed',
  );
});

test('approved Assist result sends one guarded public reply', async () => {
  const context = setup();
  const runtime = await context.orchestrator.execute(
    command('assist'),
    connection,
    now,
  );
  const actions = new ApprovalActionService(
    context.approvals,
    context.delivery,
  );
  const approved = await actions.apply(
    actionCommand(runtime.approval?.approval_id ?? ''),
    connection,
    now,
  );
  assert.equal(approved.approval.state, 'approved');
  assert.equal(approved.delivery_receipt?.message_type, 'public_reply');
  assert.equal(context.transport.requests.length, 1);
  assert.equal(context.transport.requests[0]?.body.private, false);
  assert.equal(
    context.stateMachine.getSnapshot(traceId)?.execution_state,
    'replied',
  );
});

test('rejected Assist result cannot later send its suggested reply', async () => {
  const context = setup();
  const runtime = await context.orchestrator.execute(
    command('assist'),
    connection,
    now,
  );
  const actions = new ApprovalActionService(
    context.approvals,
    context.delivery,
  );
  const approvalId = runtime.approval?.approval_id ?? '';
  const rejected = await actions.apply(
    {
      ...actionCommand(approvalId),
      action_id: '018f7f4a-7c1d-7b22-8d41-1234567890b8',
      action: 'reject',
      conversation_id: null,
      delivery_id: null,
      deadline_at: null,
      idempotency_key: 'reject-runtime-approval',
    },
    null,
    now,
  );
  assert.equal(rejected.approval.state, 'rejected');
  await assert.rejects(
    actions.apply(actionCommand(approvalId), connection, now),
    (error: unknown) =>
      error instanceof ApprovalActionError &&
      error.code === 'terminal_approval',
  );
  assert.equal(context.transport.requests.length, 0);
});

test('rejects changed idempotent input and cross-scope execution', async () => {
  const context = setup();
  const input = command('shadow');
  await context.orchestrator.execute(input, connection, now);
  await assert.rejects(
    context.orchestrator.execute(
      { ...input, conversation_id: '2002' },
      connection,
      now,
    ),
    (error: unknown) =>
      error instanceof RuntimeOrchestratorError &&
      error.code === 'idempotency_conflict',
  );

  const crossScope = setup();
  const invalid = command('auto');
  invalid.pipeline.trace_append = {
    ...invalid.pipeline.trace_append,
    tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890b9',
  };
  await assert.rejects(
    crossScope.orchestrator.execute(invalid, connection, now),
    (error: unknown) =>
      error instanceof RuntimeOrchestratorError &&
      error.code === 'scope_mismatch',
  );
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
  const transport = new FakeTransport(status);
  const delivery = new ChatwootDeliveryService(transport, {
    resolve: () => 'plaintext-token',
  });
  return {
    stateMachine,
    approvals,
    transport,
    delivery,
    orchestrator: new RuntimeOrchestrator(
      stateMachine,
      approvals,
      delivery,
    ),
  };
}

function command(requestedMode: RuntimeMode): RuntimeExecutionCommand {
  return {
    execution_id: '018f7f4a-7c1d-7b22-8d41-1234567890b0',
    tenant_id: tenantId,
    trace_id: traceId,
    conversation_id: '1001',
    expected_state: 'planned',
    requested_mode: requestedMode,
    pipeline: pipeline(),
    runtime_config: runtimeConfig(),
    version_snapshot: versionSnapshot(),
    daily_budget_exceeded: false,
    idempotency_key: `execute-${requestedMode}`,
    delivery_id: '018f7f4a-7c1d-7b22-8d41-1234567890b1',
    approval_id: '018f7f4a-7c1d-7b22-8d41-1234567890b2',
    deadline_at: '2026-06-19T00:01:00.000Z',
    approval_expires_at: '2026-06-19T01:00:00.000Z',
    occurred_at: now,
  };
}

function runtimeConfig(): RuntimeModeConfig {
  return {
    id: '018f7f4a-7c1d-7b22-8d41-1234567890b3',
    tenant_id: tenantId,
    version: 1,
    allowed_auto_intents: ['return_policy'],
    max_auto_risk_severity: 'P3',
    max_auto_latency_ms: 5000,
    max_auto_cost_per_ticket: 0.1,
    auto_downgrade_mode: 'assist',
    is_active: true,
    config_hash: 'a'.repeat(64),
  };
}

function versionSnapshot(): TraceVersionSnapshot {
  return {
    agent_version_id: 'agent-v1',
    prompt_version_id: 'prompt-v1',
    policy_version_id: 'policy-v1',
    tool_manifest_version_id: 'tools-v1',
    risk_rule_version_id: 'risk-v1',
    retrieval_config_version_id: 'retrieval-v1',
    model_config_version_id: '018f7f4a-7c1d-7b22-8d41-1234567890b4',
  };
}

function pipeline(): AgentPipelineRun {
  return {
    route: {
      intent: 'return_policy',
      candidate_intents: ['return_policy'],
      confidence: 0.95,
      route: 'policy',
      entities: { order_ids: [] },
      required_capabilities: ['rag', 'risk_guardrail', 'response_agent'],
      sensitive_signals: [],
      triage_required: false,
      reason_codes: ['matched_return_policy'],
    },
    triage: null,
    evidence: null,
    tool_requests: [],
    tool_results: [],
    risk: {
      tenant_id: tenantId,
      trace_id: traceId,
      risk_rule_version_id: 'risk-v1',
      decisions: [],
      blocking: false,
      highest_severity: 'P3',
      recommendation: 'allow',
    },
    response: {
      action: 'reply',
      text: 'Returns are accepted within 30 days.',
      evidence_refs: ['evidence:return-policy'],
      tool_result_refs: [],
      model_name: 'fast-model',
      fallback_used: false,
      grounded: true,
      blocking_reason: null,
      delivery_performed: false,
      approval_created: false,
    },
    trace_append: {
      trace_id: traceId,
      tenant_id: tenantId,
      intent: 'return_policy',
      route: 'policy',
      route_confidence: 0.95,
      evidence_ids: ['evidence:return-policy'],
      evidence_score_max: 0.9,
      tool_call_ids: [],
      tool_result_ids: [],
      gate_decision_ids: [],
      model_name: 'fast-model',
      fallback_used: false,
      latency_ms: 1000,
      input_tokens: 100,
      output_tokens: 40,
      estimated_cost: 0.01,
      final_recommendation: 'allow',
      final_action: 'reply',
      failure_reason: null,
    },
    steps: {
      route: step(null),
      triage: step(null),
      rag: step(null),
      tools: step([]),
      risk: step(null),
      response: step(null),
    },
  };
}

function refundPipeline(
  resultStatus: 'succeeded' | 'failed',
): AgentPipelineRun {
  const value = pipeline();
  const callId = '018f7f4a-7c1d-7b22-8d41-1234567890bb';
  const resultId = 'tool-result:refund-dry-run';
  return {
    ...value,
    route: {
      ...value.route,
      intent: 'refund_request',
      candidate_intents: ['refund_request'],
      route: 'refund',
      required_capabilities: [
        'refund_tool',
        'risk_guardrail',
        'response_agent',
      ],
      reason_codes: ['matched_refund_request'],
    },
    tool_requests: [
      {
        call_id: callId,
        trace_id: traceId,
        tenant_id: tenantId,
        contact_id: 'contact-1',
        tool_name: 'create_refund_request_dry_run',
        tool_manifest_version_id: 'tools-v1',
        idempotency_key: 'refund-dry-run',
        arguments: { order_id: 'ORDER-1', reason: 'Damaged item' },
        permissions: ['refund:dry_run'],
        deadline_at: '2026-06-19T00:00:30.000Z',
      },
    ],
    tool_results: [
      {
        call_id: callId,
        result_id: resultId,
        trace_id: traceId,
        tenant_id: tenantId,
        tool_name: 'create_refund_request_dry_run',
        status: resultStatus,
        code: resultStatus === 'succeeded' ? 'ok' : 'retryable_error',
        retryable: resultStatus === 'failed',
        dry_run: true,
        data:
          resultStatus === 'succeeded'
            ? { external_side_effect: false }
            : null,
        audit: {
          call_id: callId,
          trace_id: traceId,
          tenant_id: tenantId,
          tool_name: 'create_refund_request_dry_run',
          tool_manifest_version_id: 'tools-v1',
          decision:
            resultStatus === 'succeeded' ? 'ok' : 'retryable_error',
          input_hash: 'b'.repeat(64),
          output_hash: resultStatus === 'succeeded' ? 'c'.repeat(64) : null,
          created_at: now,
        },
      },
    ],
    risk: {
      ...value.risk,
      highest_severity: 'P1',
      recommendation: 'sanitize',
    },
    response: {
      ...value.response,
      text: 'A refund dry-run is ready for review.',
      tool_result_refs: [resultId],
      grounded: true,
    },
    trace_append: {
      ...value.trace_append,
      intent: 'refund_request',
      route: 'refund',
      tool_call_ids: [callId],
      tool_result_ids: [resultId],
      final_recommendation: 'sanitize',
    },
  };
}

function actionCommand(approvalId: string): ApprovalActionCommand {
  return {
    action_id: '018f7f4a-7c1d-7b22-8d41-1234567890b5',
    approval_id: approvalId,
    tenant_id: tenantId,
    trace_id: traceId,
    expected_state: 'pending',
    action: 'approve',
    actor_type: 'operator',
    actor_id: 'operator-1',
    edited_reply: null,
    conversation_id: '1001',
    delivery_id: '018f7f4a-7c1d-7b22-8d41-1234567890b6',
    deadline_at: '2026-06-19T00:02:00.000Z',
    idempotency_key: 'approve-runtime-approval',
    occurred_at: now,
  };
}

function step<T>(data: T) {
  return {
    status: 'succeeded' as const,
    data,
    reason_code: null,
    started_at: now,
    completed_at: '2026-06-19T00:00:00.001Z',
  };
}

const connection = {
  tenant_id: tenantId,
  base_url: 'https://chatwoot.example.com',
  account_id: 42,
  api_token_ref: 'secret://chatwoot',
};
