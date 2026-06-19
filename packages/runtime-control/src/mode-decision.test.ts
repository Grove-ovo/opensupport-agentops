import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AgentPipelineRun,
  RuntimeMode,
  RuntimeModeConfig,
} from '@opensupport/shared';
import { RuntimeModeDecisionError, decideRuntimeMode } from './index.js';

const tenantId = '018f7f4a-7c1d-7b22-8d41-1234567890aa';
const traceId = '018f7f4a-7c1d-7b22-8d41-1234567890ab';

test('maps Shadow, Assist, and allowed Auto to distinct actions', () => {
  assert.equal(decide('shadow').action, 'private_note');
  assert.equal(decide('assist').action, 'create_approval');
  const auto = decide('auto');
  assert.equal(auto.action, 'public_reply');
  assert.equal(auto.effective_mode, 'auto');
});

test('blocks risk P0 and missing proposals from Auto', () => {
  const risky = pipeline();
  risky.risk = { ...risky.risk, blocking: true, highest_severity: 'P0' };
  assert.equal(decide('auto', risky).action, 'handoff');

  const missing = pipeline();
  missing.response = { ...missing.response, text: null, grounded: false };
  const result = decide('auto', missing);
  assert.equal(result.action, 'handoff');
  assert.ok(result.reason_codes.includes('proposal_unavailable'));
});

test('downgrades unsupported and ungrounded Auto work to Assist', () => {
  const unsupported = pipeline();
  unsupported.route = { ...unsupported.route, intent: 'refund_request' };
  const result = decide('auto', unsupported);
  assert.equal(result.effective_mode, 'assist');
  assert.equal(result.action, 'create_approval');
  assert.ok(result.reason_codes.includes('intent_not_auto_allowed'));
});

test('records cost and latency downgrade reasons', () => {
  const expensive = pipeline();
  expensive.trace_append = {
    ...expensive.trace_append,
    estimated_cost: 0.5,
    latency_ms: 9000,
  };
  const result = decide('auto', expensive);
  assert.deepEqual(result.reason_codes, [
    'ticket_budget_exceeded',
    'latency_exceeded',
  ]);
  assert.equal(result.effective_mode, 'assist');
});

test('daily budget forces Shadow', () => {
  const result = decide('auto', pipeline(), true);
  assert.equal(result.effective_mode, 'shadow');
  assert.equal(result.action, 'private_note');
  assert.deepEqual(result.reason_codes, ['daily_budget_exceeded']);
});

test('rejects cross-tenant config', () => {
  assert.throws(
    () =>
      decideRuntimeMode({
        requested_mode: 'auto',
        pipeline: pipeline(),
        config: { ...config(), tenant_id: traceId },
        daily_budget_exceeded: false,
      }),
    (error: unknown) =>
      error instanceof RuntimeModeDecisionError &&
      error.code === 'scope_mismatch',
  );
});

test('rejects invalid runtime policy values received outside TypeScript', () => {
  assert.throws(
    () =>
      decideRuntimeMode({
        requested_mode: 'auto',
        pipeline: pipeline(),
        config: {
          ...config(),
          allowed_auto_intents: ['not-an-intent' as never],
        },
        daily_budget_exceeded: false,
      }),
    (error: unknown) =>
      error instanceof RuntimeModeDecisionError &&
      error.code === 'invalid_input',
  );
});

function decide(
  requestedMode: RuntimeMode,
  value = pipeline(),
  dailyBudgetExceeded = false,
) {
  return decideRuntimeMode(
    {
      requested_mode: requestedMode,
      pipeline: value,
      config: config(),
      daily_budget_exceeded: dailyBudgetExceeded,
    },
    '2026-06-19T00:00:00.000Z',
  );
}

function config(): RuntimeModeConfig {
  return {
    id: '018f7f4a-7c1d-7b22-8d41-1234567890ac',
    tenant_id: tenantId,
    version: 1,
    allowed_auto_intents: [
      'order_status',
      'logistics_query',
      'return_policy',
      'unknown',
    ],
    max_auto_risk_severity: 'P3',
    max_auto_latency_ms: 5000,
    max_auto_cost_per_ticket: 0.1,
    auto_downgrade_mode: 'assist',
    is_active: true,
    config_hash: 'a'.repeat(64),
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
      evidence_refs: ['evidence:return'],
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
      evidence_ids: ['evidence:return'],
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

function step<T>(data: T) {
  return {
    status: 'succeeded' as const,
    data,
    reason_code: null,
    started_at: '2026-06-19T00:00:00.000Z',
    completed_at: '2026-06-19T00:00:00.001Z',
  };
}
