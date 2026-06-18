import { LLMObservabilityValidationError } from './errors.js';
import type {
  CostBudgetDecision,
  EstimateLLMCallCostInput,
  EvaluateCostBudgetInput,
  LLMCallCostEstimate,
  LLMObservabilityValidationIssue,
} from './types.js';

const MICRO_SCALE = 1_000_000;
const MICRO_SCALE_BIGINT = 1_000_000n;
const MAX_NUMERIC_VALUE = 999_999.999_999;
const MAX_NUMERIC_MICROS = 999_999_999_999;
const MAX_SAFE_MONEY_VALUE = Number.MAX_SAFE_INTEGER / MICRO_SCALE;
const MAX_TOKEN_COUNT = 2_147_483_647;

export function estimateLLMCallCost(
  input: EstimateLLMCallCostInput,
): LLMCallCostEstimate {
  const issues: LLMObservabilityValidationIssue[] = [];
  validateTokenCount(input.inputTokens, 'inputTokens', issues);
  validateTokenCount(input.outputTokens, 'outputTokens', issues);
  const inputRateMicros = validateMoney(
    input.inputCostPerMillion,
    'inputCostPerMillion',
    issues,
  );
  const outputRateMicros = validateMoney(
    input.outputCostPerMillion,
    'outputCostPerMillion',
    issues,
  );

  throwIfIssues(issues);

  const inputCostMicros = calculateTokenCostMicros(
    input.inputTokens,
    inputRateMicros,
  );
  const outputCostMicros = calculateTokenCostMicros(
    input.outputTokens,
    outputRateMicros,
  );
  const totalCostMicros = inputCostMicros + outputCostMicros;

  if (totalCostMicros > MAX_NUMERIC_MICROS) {
    throw new LLMObservabilityValidationError([
      { field: 'estimatedCallCost', code: 'out_of_range' },
    ]);
  }

  return {
    inputCostMicros,
    outputCostMicros,
    totalCostMicros,
    estimatedCost: fromMicros(totalCostMicros),
  };
}

export function evaluateCostBudget(
  input: EvaluateCostBudgetInput,
): CostBudgetDecision {
  const issues: LLMObservabilityValidationIssue[] = [];
  const currentTicketCostMicros = validateAggregateMoney(
    input.currentTicketCost,
    'currentTicketCost',
    issues,
  );
  const currentDailyCostMicros = validateAggregateMoney(
    input.currentDailyCost,
    'currentDailyCost',
    issues,
  );
  const estimatedCallCostMicros = validateMoney(
    input.estimatedCallCost,
    'estimatedCallCost',
    issues,
  );
  const ticketBudgetMicros = validateMoney(
    input.maxCostPerTicket,
    'maxCostPerTicket',
    issues,
  );
  const dailyBudgetMicros = validateMoney(
    input.dailyBudget,
    'dailyBudget',
    issues,
  );
  const costCurrency = normalizeCurrency(
    input.costCurrency,
    'costCurrency',
    issues,
  );
  const budgetCurrency = normalizeCurrency(
    input.budgetCurrency,
    'budgetCurrency',
    issues,
  );

  if (
    costCurrency.length > 0 &&
    budgetCurrency.length > 0 &&
    costCurrency !== budgetCurrency
  ) {
    issues.push({ field: 'costCurrency', code: 'currency_mismatch' });
  }

  throwIfIssues(issues);

  const projectedTicketCostMicros =
    currentTicketCostMicros + estimatedCallCostMicros;
  const projectedDailyCostMicros =
    currentDailyCostMicros + estimatedCallCostMicros;

  if (
    !Number.isSafeInteger(projectedTicketCostMicros) ||
    !Number.isSafeInteger(projectedDailyCostMicros)
  ) {
    throw new LLMObservabilityValidationError([
      { field: 'estimatedCallCost', code: 'out_of_range' },
    ]);
  }

  const ticketExceeded =
    ticketBudgetMicros > 0 &&
    projectedTicketCostMicros > ticketBudgetMicros;
  const dailyExceeded =
    dailyBudgetMicros > 0 &&
    projectedDailyCostMicros > dailyBudgetMicros;

  return {
    reasonCode: budgetReasonCode(ticketExceeded, dailyExceeded),
    projectedTicketCost: fromMicros(projectedTicketCostMicros),
    projectedDailyCost: fromMicros(projectedDailyCostMicros),
    projectedTicketCostMicros,
    projectedDailyCostMicros,
  };
}

function calculateTokenCostMicros(
  tokens: number,
  rateMicrosPerMillion: number,
): number {
  const numerator = BigInt(tokens) * BigInt(rateMicrosPerMillion);
  const rounded = (numerator + MICRO_SCALE_BIGINT / 2n) / MICRO_SCALE_BIGINT;

  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new LLMObservabilityValidationError([
      { field: 'estimatedCallCost', code: 'out_of_range' },
    ]);
  }

  return Number(rounded);
}

function validateTokenCount(
  value: number,
  field: 'inputTokens' | 'outputTokens',
  issues: LLMObservabilityValidationIssue[],
): void {
  if (!Number.isInteger(value)) {
    issues.push({ field, code: 'invalid_integer' });
  } else if (value < 0 || value > MAX_TOKEN_COUNT) {
    issues.push({ field, code: 'out_of_range' });
  }
}

function validateMoney(
  value: number,
  field: LLMObservabilityValidationIssue['field'],
  issues: LLMObservabilityValidationIssue[],
): number {
  if (!Number.isFinite(value)) {
    issues.push({ field, code: 'invalid_number' });
    return 0;
  }

  if (value < 0 || value > MAX_NUMERIC_VALUE) {
    issues.push({ field, code: 'out_of_range' });
    return 0;
  }

  const micros = Math.round(value * MICRO_SCALE);
  if (Math.abs(value - micros / MICRO_SCALE) > 1e-12) {
    issues.push({ field, code: 'invalid_precision' });
    return 0;
  }

  return micros;
}

function validateAggregateMoney(
  value: number,
  field: 'currentTicketCost' | 'currentDailyCost',
  issues: LLMObservabilityValidationIssue[],
): number {
  if (!Number.isFinite(value)) {
    issues.push({ field, code: 'invalid_number' });
    return 0;
  }

  if (value < 0 || value > MAX_SAFE_MONEY_VALUE) {
    issues.push({ field, code: 'out_of_range' });
    return 0;
  }

  const micros = Math.round(value * MICRO_SCALE);
  if (
    !Number.isSafeInteger(micros) ||
    Math.abs(value - micros / MICRO_SCALE) > 1e-12
  ) {
    issues.push({ field, code: 'invalid_precision' });
    return 0;
  }

  return micros;
}

function normalizeCurrency(
  value: string,
  field: 'costCurrency' | 'budgetCurrency',
  issues: LLMObservabilityValidationIssue[],
): string {
  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    issues.push({ field, code: 'invalid_currency' });
  }

  return normalized;
}

function budgetReasonCode(
  ticketExceeded: boolean,
  dailyExceeded: boolean,
): CostBudgetDecision['reasonCode'] {
  if (ticketExceeded && dailyExceeded) {
    return 'ticket_and_daily_budget_exceeded';
  }
  if (ticketExceeded) {
    return 'ticket_budget_exceeded';
  }
  if (dailyExceeded) {
    return 'daily_budget_exceeded';
  }
  return 'within_budget';
}

function fromMicros(value: number): number {
  return value / MICRO_SCALE;
}

function throwIfIssues(
  issues: readonly LLMObservabilityValidationIssue[],
): void {
  if (issues.length > 0) {
    throw new LLMObservabilityValidationError(issues);
  }
}
