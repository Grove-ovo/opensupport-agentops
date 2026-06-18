import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLLMCallLog,
  estimateLLMCallCost,
  evaluateCostBudget,
  LLMObservabilityValidationError,
} from './index.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const traceId = '22222222-2222-4222-8222-222222222222';
const modelConfigVersionId = '33333333-3333-4333-8333-333333333333';

test('estimates input and output cost with integer micro-unit arithmetic', () => {
  const estimate = estimateLLMCallCost({
    inputTokens: 1_250,
    outputTokens: 750,
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10,
  });

  assert.deepEqual(estimate, {
    inputCostMicros: 3_125,
    outputCostMicros: 7_500,
    totalCostMicros: 10_625,
    estimatedCost: 0.010625,
  });
});

test('rounds half a micro-unit deterministically', () => {
  const estimate = estimateLLMCallCost({
    inputTokens: 1,
    outputTokens: 0,
    inputCostPerMillion: 0.5,
    outputCostPerMillion: 0,
  });

  assert.equal(estimate.totalCostMicros, 1);
  assert.equal(estimate.estimatedCost, 0.000001);
});

test('evaluates each budget reason code using projected costs', () => {
  const base = {
    currentTicketCost: 0.01,
    currentDailyCost: 4,
    estimatedCallCost: 0.01,
    maxCostPerTicket: 0.02,
    dailyBudget: 5,
    costCurrency: 'usd',
    budgetCurrency: 'USD',
  };

  assert.equal(evaluateCostBudget(base).reasonCode, 'within_budget');
  assert.equal(
    evaluateCostBudget({
      ...base,
      currentTicketCost: 0.019,
    }).reasonCode,
    'ticket_budget_exceeded',
  );
  assert.equal(
    evaluateCostBudget({
      ...base,
      currentDailyCost: 4.999,
    }).reasonCode,
    'daily_budget_exceeded',
  );
  assert.equal(
    evaluateCostBudget({
      ...base,
      currentTicketCost: 0.019,
      currentDailyCost: 4.999,
    }).reasonCode,
    'ticket_and_daily_budget_exceeded',
  );
});

test('treats zero budgets as disabled limits', () => {
  const decision = evaluateCostBudget({
    currentTicketCost: 900,
    currentDailyCost: 900,
    estimatedCallCost: 1,
    maxCostPerTicket: 0,
    dailyBudget: 0,
    costCurrency: 'USD',
    budgetCurrency: 'USD',
  });

  assert.equal(decision.reasonCode, 'within_budget');
});

test('reports exceeded budgets when accumulated costs exceed per-row numeric limits', () => {
  const decision = evaluateCostBudget({
    currentTicketCost: 1_000_000,
    currentDailyCost: 1_000_000,
    estimatedCallCost: 0.01,
    maxCostPerTicket: 0.02,
    dailyBudget: 5,
    costCurrency: 'USD',
    budgetCurrency: 'USD',
  });

  assert.equal(decision.reasonCode, 'ticket_and_daily_budget_exceeded');
  assert.equal(decision.projectedTicketCost, 1_000_000.01);
  assert.equal(decision.projectedDailyCost, 1_000_000.01);
});

test('rejects budget comparisons across currencies', () => {
  assert.throws(
    () => evaluateCostBudget({
      currentTicketCost: 0,
      currentDailyCost: 0,
      estimatedCallCost: 0.01,
      maxCostPerTicket: 1,
      dailyBudget: 10,
      costCurrency: 'USD',
      budgetCurrency: 'EUR',
    }),
    (error: unknown) =>
      error instanceof LLMObservabilityValidationError &&
      error.issues.some((issue) => issue.code === 'currency_mismatch'),
  );
});

test('creates a normalized append-only persistence record without prompt content', () => {
  const log = createLLMCallLog({
    id: '44444444-4444-4444-8444-444444444444',
    tenantId,
    ticketId: ' ticket-42 ',
    conversationId: ' conversation-42 ',
    traceId,
    modelConfigVersionId,
    promptVersionId: ' support-v3 ',
    modelProvider: ' OpenAI ',
    modelName: 'gpt-4.1-mini',
    callStatus: 'succeeded',
    inputTokens: 1_250,
    outputTokens: 750,
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10,
    costCurrency: 'usd',
    latencyMs: 830,
    budgetReasonCode: 'within_budget',
    createdAt: '2026-06-18T00:00:00.000Z',
  });

  assert.equal(log.tenant_id, tenantId);
  assert.equal(log.ticket_id, 'ticket-42');
  assert.equal(log.model_provider, 'openai');
  assert.equal(log.estimated_cost, 0.010625);
  assert.equal(log.cost_currency, 'USD');
  assert.equal(log.error_code, null);
  assert.equal(log.created_at, '2026-06-18T00:00:00.000Z');
  assert.equal('total_tokens' in log, false);
  assert.equal('prompt_content' in log, false);
  assert.equal('completion_content' in log, false);
  assert.equal('provider_payload' in log, false);
});

test('requires an error code for unsuccessful calls and forbids it on success', () => {
  assert.throws(
    () => createLLMCallLog(validLogInput({
      callStatus: 'timed_out',
      errorCode: null,
    })),
    (error: unknown) =>
      error instanceof LLMObservabilityValidationError &&
      error.issues.some((issue) => issue.code === 'invalid_status_error'),
  );

  assert.throws(
    () => createLLMCallLog(validLogInput({
      callStatus: 'succeeded',
      errorCode: 'provider_error',
    })),
    (error: unknown) =>
      error instanceof LLMObservabilityValidationError &&
      error.issues.some((issue) => issue.code === 'invalid_status_error'),
  );
});

test('rejects unsupported runtime enum values', () => {
  assert.throws(
    () => createLLMCallLog(validLogInput({
      callStatus: 'unknown' as Parameters<typeof createLLMCallLog>[0]['callStatus'],
      budgetReasonCode:
        'unknown' as Parameters<typeof createLLMCallLog>[0]['budgetReasonCode'],
      errorCode: 'invalid_status',
    })),
    (error: unknown) =>
      error instanceof LLMObservabilityValidationError &&
      error.issues.filter((issue) => issue.code === 'invalid_enum').length === 2,
  );
});

test('rejects invalid identifiers, token counts, rates, latency, and timestamps', () => {
  assert.throws(
    () => createLLMCallLog(validLogInput({
      tenantId: 'tenant-demo',
      inputTokens: -1,
      inputCostPerMillion: 0.0000001,
      latencyMs: -1,
      createdAt: 'not-a-date',
    })),
    (error: unknown) => {
      assert.ok(error instanceof LLMObservabilityValidationError);
      assert.deepEqual(
        new Set(error.issues.map((issue) => issue.field)),
        new Set(['tenantId', 'latencyMs', 'createdAt']),
      );
      return true;
    },
  );

  assert.throws(
    () => estimateLLMCallCost({
      inputTokens: -1,
      outputTokens: 0,
      inputCostPerMillion: 0.0000001,
      outputCostPerMillion: 0,
    }),
    (error: unknown) =>
      error instanceof LLMObservabilityValidationError &&
      error.issues.length === 2,
  );
});

function validLogInput(
  overrides: Partial<Parameters<typeof createLLMCallLog>[0]> = {},
): Parameters<typeof createLLMCallLog>[0] {
  return {
    tenantId,
    ticketId: 'ticket-42',
    conversationId: 'conversation-42',
    traceId,
    modelConfigVersionId,
    promptVersionId: 'support-v3',
    modelProvider: 'openai',
    modelName: 'gpt-4.1-mini',
    callStatus: 'succeeded',
    inputTokens: 100,
    outputTokens: 50,
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10,
    costCurrency: 'USD',
    latencyMs: 500,
    errorCode: null,
    budgetReasonCode: 'within_budget',
    createdAt: '2026-06-18T00:00:00.000Z',
    ...overrides,
  };
}
