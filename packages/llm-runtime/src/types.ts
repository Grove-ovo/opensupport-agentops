import type {
  AgentPipelineContext,
  NewLLMCallLog,
  RouteDecision,
  TenantModelConfig,
  TriageDecision,
} from '@opensupport/shared';

export interface LLMProviderRequest {
  provider: string;
  model: string;
  apiKey: string;
  prompt: string;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface LLMProviderResponse {
  output: unknown;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProviderAdapter {
  invoke(request: LLMProviderRequest): Promise<LLMProviderResponse>;
}

export interface ModelPricing {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface InvokeTenantModelInput {
  context: AgentPipelineContext;
  config: TenantModelConfig;
  masterKey: Uint8Array;
  provider: LLMProviderAdapter;
  prompt: string;
  promptVersionId: string;
  maxOutputTokens: number;
  estimatedInputTokens: number;
  currentTicketCost: number;
  currentDailyCost: number;
  pricingByModel: Readonly<Record<string, ModelPricing>>;
  log: (record: NewLLMCallLog) => void | Promise<void>;
  parse: (output: unknown, modelName: string) => unknown;
  now?: (() => number) | undefined;
}

export type LLMRuntimeStatus =
  | 'succeeded'
  | 'budget_blocked'
  | 'failed';

export interface LLMRuntimeResult<T> {
  status: LLMRuntimeStatus;
  data: T | null;
  model_name: string | null;
  fallback_used: boolean;
  reason_code: string | null;
  attempts: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  } | null;
}

export interface RunConditionalTriageInput
  extends Omit<
    InvokeTenantModelInput,
    'prompt' | 'parse' | 'promptVersionId'
  > {
  routeDecision: RouteDecision;
  promptVersionId: string;
}

export interface ConditionalTriageResult {
  status: 'skipped' | 'succeeded' | 'degraded';
  decision: TriageDecision | null;
  reason_code: string | null;
  attempts: number;
  usage: LLMRuntimeResult<unknown>['usage'];
}
