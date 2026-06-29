import {
  createLLMCallLog,
  estimateLLMCallCost,
  evaluateCostBudget,
} from '@opensupport/llm-observability';
import { decryptApiKey } from '@opensupport/model-config';
import type { BudgetReasonCode, NewLLMCallLog } from '@opensupport/shared';
import type {
  InvokeTenantModelInput,
  LLMProviderResponse,
  LLMRuntimeResult,
  ModelPricing,
} from './types.js';

export async function invokeTenantModel<T>(
  input: InvokeTenantModelInput,
): Promise<LLMRuntimeResult<T>> {
  assertRuntimeContext(input);
  const models = uniqueModels(input.config.fast_model, input.config.fallback_model);
  for (const model of models) {
    requirePricing(input.pricingByModel, model);
  }
  const preflightPricing = requirePricing(input.pricingByModel, models[0] as string);
  const preflightEstimate = estimateLLMCallCost({
    inputTokens: input.estimatedInputTokens,
    outputTokens: input.maxOutputTokens,
    ...pricingInput(preflightPricing),
  });
  const budget = evaluateCostBudget({
    currentTicketCost: input.currentTicketCost,
    currentDailyCost: input.currentDailyCost,
    estimatedCallCost: preflightEstimate.estimatedCost,
    maxCostPerTicket: input.config.max_cost_per_ticket,
    dailyBudget: input.config.daily_budget,
    costCurrency: input.config.budget_currency,
    budgetCurrency: input.config.budget_currency,
  });

  if (budget.reasonCode !== 'within_budget') {
    const startedAt = (input.now ?? Date.now)();
    await writeLog(input, {
      model: models[0] as string,
      pricing: preflightPricing,
      response: null,
      startedAt,
      status: 'cancelled',
      errorCode: budget.reasonCode,
      budgetReasonCode: budget.reasonCode,
    });
    return {
      status: 'budget_blocked',
      data: null,
      model_name: null,
      fallback_used: false,
      reason_code: budget.reasonCode,
      attempts: 0,
      usage: null,
    };
  }

  const apiKey = decryptApiKey({
    encryptedReference: input.config.encrypted_api_key_ref,
    masterKey: input.masterKey,
    tenantId: input.config.tenant_id,
    provider: input.config.provider,
  });
  let lastReason = 'provider_failed';

  try {
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index] as string;
      const pricing = requirePricing(input.pricingByModel, model);
      const startedAt = (input.now ?? Date.now)();

      try {
        const response = await invokeWithDeadline(input, model, apiKey);
        const parsed = input.parse(response.output, model) as T;
        await writeLog(input, {
          model,
          pricing,
          response,
          startedAt,
          status: 'succeeded',
          errorCode: null,
          budgetReasonCode: 'within_budget',
        });
        return {
          status: 'succeeded',
          data: parsed,
          model_name: model,
          fallback_used: index > 0,
          reason_code: null,
          attempts: index + 1,
          usage: {
            input_tokens: response.inputTokens,
            output_tokens: response.outputTokens,
            estimated_cost: estimateLLMCallCost({
              inputTokens: response.inputTokens,
              outputTokens: response.outputTokens,
              ...pricingInput(pricing),
            }).estimatedCost,
          },
        };
      } catch (error) {
        const reason = runtimeErrorCode(error);
        lastReason = reason;
        await writeLog(input, {
          model,
          pricing,
          response: null,
          startedAt,
          status: reason === 'model_timeout' ? 'timed_out' : 'failed',
          errorCode: reason,
          budgetReasonCode: 'within_budget',
        });
      }
    }
  } finally {
    // JavaScript strings cannot be zeroed. Keep the decrypted key scoped to
    // this call and never return, log, or persist it.
    void apiKey;
  }

  return {
    status: 'failed',
    data: null,
    model_name: models.at(-1) ?? null,
    fallback_used: models.length > 1,
    reason_code: lastReason,
    attempts: models.length,
    usage: null,
  };
}

async function invokeWithDeadline(
  input: InvokeTenantModelInput,
  model: string,
  apiKey: string,
): Promise<LLMProviderResponse> {
  const now = (input.now ?? Date.now)();
  const remaining = Date.parse(input.context.deadline_at) - now;
  const timeoutMs = Math.min(input.config.timeout_ms, remaining);
  if (timeoutMs <= 0) {
    throw new RuntimeError('model_timeout');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await input.provider.invoke({
      provider: input.config.provider,
      model,
      apiKey,
      prompt: input.prompt,
      maxOutputTokens: input.maxOutputTokens,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RuntimeError('model_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function writeLog(
  input: InvokeTenantModelInput,
  attempt: {
    model: string;
    pricing: ModelPricing;
    response: LLMProviderResponse | null;
    startedAt: number;
    status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
    errorCode: string | null;
    budgetReasonCode: BudgetReasonCode;
  },
): Promise<void> {
  const finishedAt = (input.now ?? Date.now)();
  const record: NewLLMCallLog = createLLMCallLog({
    tenantId: input.context.tenant_id,
    ticketId: input.context.ticket_id,
    conversationId: input.context.conversation_id,
    traceId: input.context.trace_id,
    modelConfigVersionId: input.config.id,
    promptVersionId: input.promptVersionId,
    modelProvider: input.config.provider,
    modelName: attempt.model,
    callStatus: attempt.status,
    inputTokens: attempt.response?.inputTokens ?? 0,
    outputTokens: attempt.response?.outputTokens ?? 0,
    ...pricingInput(attempt.pricing),
    costCurrency: input.config.budget_currency,
    latencyMs: Math.max(0, Math.round(finishedAt - attempt.startedAt)),
    errorCode: attempt.errorCode,
    budgetReasonCode: attempt.budgetReasonCode,
    createdAt: new Date(finishedAt),
  });
  await input.log(record);
}

function assertRuntimeContext(input: InvokeTenantModelInput): void {
  if (
    input.context.tenant_id !== input.config.tenant_id ||
    input.context.version_snapshot.model_config_version_id !== input.config.id
  ) {
    throw new RuntimeError('model_config_mismatch');
  }
  if (input.prompt.trim().length === 0) {
    throw new RuntimeError('invalid_prompt');
  }
  if (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1) {
    throw new RuntimeError('invalid_max_output_tokens');
  }
}

function uniqueModels(primary: string, fallback: string): string[] {
  return primary === fallback ? [primary] : [primary, fallback];
}

function requirePricing(
  pricing: Readonly<Record<string, ModelPricing>>,
  model: string,
): ModelPricing {
  const value = pricing[model];
  if (value === undefined) {
    throw new RuntimeError('pricing_not_configured');
  }
  return value;
}

function pricingInput(pricing: ModelPricing) {
  return {
    inputCostPerMillion: pricing.inputCostPerMillion,
    outputCostPerMillion: pricing.outputCostPerMillion,
  };
}

function runtimeErrorCode(error: unknown): string {
  if (error instanceof RuntimeError) {
    return error.code;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof Reflect.get(error, 'code') === 'string'
  ) {
    const code = String(Reflect.get(error, 'code'));
    if (
      code === 'invalid_provider_response' ||
      /^provider_[a-z0-9_]+$/.test(code)
    ) {
      return code;
    }
  }
  return 'provider_failed';
}

export class RuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RuntimeError';
  }
}
