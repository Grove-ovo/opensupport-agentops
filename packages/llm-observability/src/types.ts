import type {
  BudgetReasonCode,
  LLMCallStatus,
  NewLLMCallLog,
} from '@opensupport/shared';

export interface EstimateLLMCallCostInput {
  inputTokens: number;
  outputTokens: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface LLMCallCostEstimate {
  inputCostMicros: number;
  outputCostMicros: number;
  totalCostMicros: number;
  estimatedCost: number;
}

export interface EvaluateCostBudgetInput {
  currentTicketCost: number;
  currentDailyCost: number;
  estimatedCallCost: number;
  maxCostPerTicket: number;
  dailyBudget: number;
  costCurrency: string;
  budgetCurrency: string;
}

export interface CostBudgetDecision {
  reasonCode: BudgetReasonCode;
  projectedTicketCost: number;
  projectedDailyCost: number;
  projectedTicketCostMicros: number;
  projectedDailyCostMicros: number;
}

export interface CreateLLMCallLogInput {
  id?: string | undefined;
  tenantId: string;
  ticketId?: string | null | undefined;
  conversationId?: string | null | undefined;
  traceId: string;
  modelConfigVersionId: string;
  promptVersionId: string;
  modelProvider: string;
  modelName: string;
  callStatus: LLMCallStatus;
  inputTokens: number;
  outputTokens: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  costCurrency: string;
  latencyMs: number;
  errorCode?: string | null | undefined;
  budgetReasonCode: BudgetReasonCode;
  createdAt?: Date | string | undefined;
}

export type LLMCallLogRecord = NewLLMCallLog;

export interface LLMObservabilityValidationIssue {
  field: keyof CreateLLMCallLogInput | keyof EvaluateCostBudgetInput;
  code:
    | 'required'
    | 'invalid_uuid'
    | 'invalid_integer'
    | 'invalid_number'
    | 'invalid_precision'
    | 'invalid_currency'
    | 'currency_mismatch'
    | 'invalid_enum'
    | 'out_of_range'
    | 'invalid_status_error'
    | 'invalid_timestamp';
}
