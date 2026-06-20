import { randomUUID } from 'node:crypto';
import { isUuid, type NewLLMCallLog } from '@opensupport/shared';
import { estimateLLMCallCost } from './cost.js';
import { LLMObservabilityValidationError } from './errors.js';
import type {
  CreateLLMCallLogInput,
  LLMObservabilityValidationIssue,
} from './types.js';

const CALL_STATUSES = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
]);
const BUDGET_REASON_CODES = new Set([
  'within_budget',
  'ticket_budget_exceeded',
  'daily_budget_exceeded',
  'ticket_and_daily_budget_exceeded',
]);

export function createLLMCallLog(
  input: CreateLLMCallLogInput,
): NewLLMCallLog {
  const issues: LLMObservabilityValidationIssue[] = [];
  const id = validateUuid(input.id ?? randomUUID(), 'id', issues);
  const tenantId = validateUuid(input.tenantId, 'tenantId', issues);
  const traceId = validateUuid(input.traceId, 'traceId', issues);
  const modelConfigVersionId = validateUuid(
    input.modelConfigVersionId,
    'modelConfigVersionId',
    issues,
  );
  const ticketId = normalizeOptionalText(input.ticketId, 'ticketId', issues);
  const conversationId = normalizeOptionalText(
    input.conversationId,
    'conversationId',
    issues,
  );
  const promptVersionId = requireText(
    input.promptVersionId,
    'promptVersionId',
    issues,
  );
  const modelProvider = requireText(
    input.modelProvider,
    'modelProvider',
    issues,
  ).toLowerCase();
  const modelName = requireText(input.modelName, 'modelName', issues);
  const costCurrency = normalizeCurrency(input.costCurrency, issues);
  if (!CALL_STATUSES.has(input.callStatus)) {
    issues.push({ field: 'callStatus', code: 'invalid_enum' });
  }
  if (!BUDGET_REASON_CODES.has(input.budgetReasonCode)) {
    issues.push({ field: 'budgetReasonCode', code: 'invalid_enum' });
  }
  const errorCode = normalizeErrorCode(
    input.callStatus,
    input.errorCode,
    issues,
  );
  const createdAt = normalizeTimestamp(input.createdAt, issues);

  if (!Number.isInteger(input.latencyMs)) {
    issues.push({ field: 'latencyMs', code: 'invalid_integer' });
  } else if (input.latencyMs < 0 || input.latencyMs > 2_147_483_647) {
    issues.push({ field: 'latencyMs', code: 'out_of_range' });
  }

  if (issues.length > 0) {
    throw new LLMObservabilityValidationError(issues);
  }

  const estimate = estimateLLMCallCost({
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    inputCostPerMillion: input.inputCostPerMillion,
    outputCostPerMillion: input.outputCostPerMillion,
  });

  return {
    id,
    tenant_id: tenantId,
    ticket_id: ticketId,
    conversation_id: conversationId,
    trace_id: traceId,
    model_config_version_id: modelConfigVersionId,
    prompt_version_id: promptVersionId,
    model_provider: modelProvider,
    model_name: modelName,
    call_status: input.callStatus,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    input_cost_per_million: input.inputCostPerMillion,
    output_cost_per_million: input.outputCostPerMillion,
    estimated_cost: estimate.estimatedCost,
    cost_currency: costCurrency,
    latency_ms: input.latencyMs,
    error_code: errorCode,
    budget_reason_code: input.budgetReasonCode,
    created_at: createdAt,
  };
}

function validateUuid(
  value: string,
  field: 'id' | 'tenantId' | 'traceId' | 'modelConfigVersionId',
  issues: LLMObservabilityValidationIssue[],
): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    issues.push({ field, code: 'required' });
  } else if (!isUuid(normalized)) {
    issues.push({ field, code: 'invalid_uuid' });
  }

  return normalized;
}

function requireText(
  value: string,
  field: 'promptVersionId' | 'modelProvider' | 'modelName',
  issues: LLMObservabilityValidationIssue[],
): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    issues.push({ field, code: 'required' });
  }
  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  field: 'ticketId' | 'conversationId',
  issues: LLMObservabilityValidationIssue[],
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    issues.push({ field, code: 'required' });
  }
  return normalized;
}

function normalizeCurrency(
  value: string,
  issues: LLMObservabilityValidationIssue[],
): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    issues.push({ field: 'costCurrency', code: 'invalid_currency' });
  }
  return normalized;
}

function normalizeErrorCode(
  status: CreateLLMCallLogInput['callStatus'],
  value: string | null | undefined,
  issues: LLMObservabilityValidationIssue[],
): string | null {
  const normalized = value?.trim() ?? '';
  const valid =
    (status === 'succeeded' && normalized.length === 0) ||
    (status !== 'succeeded' && normalized.length > 0);

  if (!valid) {
    issues.push({ field: 'errorCode', code: 'invalid_status_error' });
  }

  return normalized.length === 0 ? null : normalized;
}

function normalizeTimestamp(
  value: Date | string | undefined,
  issues: LLMObservabilityValidationIssue[],
): string {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    issues.push({ field: 'createdAt', code: 'invalid_timestamp' });
    return '';
  }
  return date.toISOString();
}
