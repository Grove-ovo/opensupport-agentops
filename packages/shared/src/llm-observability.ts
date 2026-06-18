export type LLMCallStatus =
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled';

export type BudgetReasonCode =
  | 'within_budget'
  | 'ticket_budget_exceeded'
  | 'daily_budget_exceeded'
  | 'ticket_and_daily_budget_exceeded';

export interface LLMCallLog {
  id: string;
  tenant_id: string;
  ticket_id: string | null;
  conversation_id: string | null;
  trace_id: string;
  model_config_version_id: string;
  prompt_version_id: string;
  model_provider: string;
  model_name: string;
  call_status: LLMCallStatus;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_cost_per_million: number;
  output_cost_per_million: number;
  estimated_cost: number;
  cost_currency: string;
  latency_ms: number;
  error_code: string | null;
  budget_reason_code: BudgetReasonCode;
  created_at: string;
}

export type NewLLMCallLog = Omit<LLMCallLog, 'total_tokens'>;
