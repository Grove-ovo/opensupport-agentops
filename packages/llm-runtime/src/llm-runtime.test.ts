import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { createAgentPipelineContext, routeAgentMessage } from '@opensupport/agent-core';
import { createTenantModelConfig } from '@opensupport/model-config';
import type {
  LLMProviderAdapter,
  LLMProviderResponse,
} from './types.js';
import { runConditionalTriage } from './triage.js';

const masterKey = randomBytes(32);
const config = createTenantModelConfig(
  {
    tenantId: '018f7f4a-7c1d-7b22-8d41-1234567890ad',
    version: 1,
    provider: 'mock',
    fastModel: 'fast-v1',
    strongModel: 'strong-v1',
    embeddingModel: 'embed-v1',
    fallbackModel: 'fallback-v1',
    timeoutMs: 50,
    maxCostPerTicket: 1,
    dailyBudget: 10,
    budgetCurrency: 'USD',
    apiKey: 'tenant-secret',
  },
  { masterKey, keyId: 'runtime-test' },
);
const pricing = {
  'fast-v1': { inputCostPerMillion: 1, outputCostPerMillion: 2 },
  'fallback-v1': { inputCostPerMillion: 1, outputCostPerMillion: 2 },
};

function context(text: string) {
  return createAgentPipelineContext(
    {
      traceId: '018f7f4a-7c1d-7b22-8d41-1234567890ac',
      tenantId: config.tenant_id,
      ticketId: 'ticket-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      maskedText: text,
      runtimeMode: 'shadow',
      versionSnapshot: {
        agent_version_id: 'agent-v1',
        prompt_version_id: 'triage-v1',
        policy_version_id: 'policy-v1',
        tool_manifest_version_id: 'tools-v1',
        risk_rule_version_id: 'risk-v1',
        retrieval_config_version_id: 'retrieval-v1',
        model_config_version_id: config.id,
      },
      deadlineAt: '2026-06-18T12:01:00.000Z',
    },
    { now: '2026-06-18T12:00:00.000Z' },
  );
}

function input(provider: LLMProviderAdapter, text = 'I need help') {
  const pipelineContext = context(text);
  return {
    context: pipelineContext,
    routeDecision: routeAgentMessage(pipelineContext),
    config,
    masterKey,
    provider,
    promptVersionId: 'triage-v1',
    maxOutputTokens: 200,
    estimatedInputTokens: 100,
    currentTicketCost: 0,
    currentDailyCost: 0,
    pricingByModel: pricing,
    log: async () => undefined,
    now: () => Date.parse('2026-06-18T12:00:00.000Z'),
  };
}

test('skips triage when deterministic routing is sufficient', async () => {
  let calls = 0;
  const provider: LLMProviderAdapter = {
    async invoke() {
      calls += 1;
      throw new Error('should not run');
    },
  };
  const pipelineContext = context('Order id AB-1, show order status');
  const result = await runConditionalTriage({
    ...input(provider),
    context: pipelineContext,
    routeDecision: routeAgentMessage(pipelineContext),
  });
  assert.equal(result.status, 'skipped');
  assert.equal(calls, 0);
});

test('uses tenant fast model and returns a validated triage decision', async () => {
  const logs: unknown[] = [];
  const provider: LLMProviderAdapter = {
    async invoke(request) {
      assert.equal(request.apiKey, 'tenant-secret');
      assert.equal(request.model, 'fast-v1');
      assert.equal(request.prompt.includes('tenant-secret'), false);
      return response({
        intent: 'order_status',
        order_ids: ['ab-1'],
        risk_level: 'low',
        clarification_needed: false,
        clarification_question: null,
        confidence: 0.9,
      });
    },
  };
  const result = await runConditionalTriage({
    ...input(provider),
    log: (record) => {
      logs.push(record);
    },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.decision?.model_name, 'fast-v1');
  assert.deepEqual(result.decision?.entities.order_ids, ['AB-1']);
  assert.equal(logs.length, 1);
  assert.equal(JSON.stringify(logs).includes('tenant-secret'), false);
  assert.equal(JSON.stringify(logs).includes('masked_customer_text'), false);
});

test('falls back once after invalid primary output', async () => {
  const models: string[] = [];
  const provider: LLMProviderAdapter = {
    async invoke(request) {
      models.push(request.model);
      if (request.model === 'fast-v1') {
        return response({ invalid: true });
      }
      return response({
        intent: 'unknown',
        order_ids: [],
        risk_level: 'medium',
        clarification_needed: true,
        clarification_question: 'Please provide your order ID.',
        confidence: 0.4,
      });
    },
  };
  const result = await runConditionalTriage(input(provider));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.attempts, 2);
  assert.deepEqual(models, ['fast-v1', 'fallback-v1']);
});

test('blocks calls when projected cost exceeds the ticket budget', async () => {
  let calls = 0;
  const logs: Array<{ call_status: string; budget_reason_code: string }> = [];
  const provider: LLMProviderAdapter = {
    async invoke() {
      calls += 1;
      return response({});
    },
  };
  const result = await runConditionalTriage({
    ...input(provider),
    currentTicketCost: 1,
    log: async (record) => {
      logs.push({
        call_status: record.call_status,
        budget_reason_code: record.budget_reason_code,
      });
    },
  });
  assert.equal(result.status, 'degraded');
  assert.equal(result.reason_code, 'ticket_budget_exceeded');
  assert.equal(calls, 0);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.call_status, 'cancelled');
  assert.equal(logs[0]?.budget_reason_code, 'ticket_budget_exceeded');
});

test('returns degraded after primary and fallback provider failures', async () => {
  const provider: LLMProviderAdapter = {
    async invoke() {
      throw new Error('provider down');
    },
  };
  const result = await runConditionalTriage(input(provider));
  assert.equal(result.status, 'degraded');
  assert.equal(result.reason_code, 'provider_failed');
  assert.equal(result.attempts, 2);
});

test('preserves stable provider adapter error codes in logs and results', async () => {
  const errors: Array<string | null> = [];
  const provider: LLMProviderAdapter = {
    async invoke() {
      throw Object.assign(new Error('retryable provider failure'), {
        code: 'provider_retryable_error',
      });
    },
  };
  const result = await runConditionalTriage({
    ...input(provider),
    config: {
      ...config,
      fallback_model: config.fast_model,
    },
    log: (record) => {
      errors.push(record.error_code);
    },
  });
  assert.equal(result.reason_code, 'provider_retryable_error');
  assert.deepEqual(errors, ['provider_retryable_error']);
});

test('returns an explicit timeout result', async () => {
  const provider: LLMProviderAdapter = {
    invoke(request) {
      return new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    },
  };
  const result = await runConditionalTriage({
    ...input(provider),
    config: {
      ...config,
      timeout_ms: 5,
      fallback_model: config.fast_model,
    },
  });
  assert.equal(result.status, 'degraded');
  assert.equal(result.reason_code, 'model_timeout');
  assert.equal(result.attempts, 1);
});

test('rejects mismatched immutable model config before provider invocation', async () => {
  let calls = 0;
  const provider: LLMProviderAdapter = {
    async invoke() {
      calls += 1;
      return response({});
    },
  };
  const mismatched = {
    ...context('I need help'),
    version_snapshot: {
      ...context('I need help').version_snapshot,
      model_config_version_id: '018f7f4a-7c1d-7b22-8d41-123456789099',
    },
  };
  await assert.rejects(
    runConditionalTriage({
      ...input(provider),
      context: mismatched,
      routeDecision: routeAgentMessage(mismatched),
    }),
    /model_config_mismatch/,
  );
  assert.equal(calls, 0);
});

function response(output: unknown): LLMProviderResponse {
  return { output, inputTokens: 20, outputTokens: 10 };
}
