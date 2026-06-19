import type {
  AgentIntent,
  AgentPipelineContext,
  EvidenceBundle,
  GeneratedResponse,
  RAGPipelineConfig,
  ResponseProposal,
  RiskAssessment,
  RouteDecision,
  TenantModelConfig,
  ToolCallRequest,
  ToolCallResult,
  TriageDecision,
} from '@opensupport/shared';

export interface RunAgentPipelineInput {
  context: AgentPipelineContext;
  contactId: string;
  modelConfig: TenantModelConfig;
  ragConfig: RAGPipelineConfig | null;
}

export interface ResponseGenerationRequest {
  context: AgentPipelineContext;
  intent: AgentIntent;
  model_name: string;
  evidence_refs: string[];
  tool_results: readonly ToolCallResult[];
  fallback_attempt: boolean;
}

export interface AgentRuntimeAdapters {
  triage?(
    context: AgentPipelineContext,
    route: RouteDecision,
  ): Promise<TriageDecision> | TriageDecision;
  retrieveEvidence?(
    context: AgentPipelineContext,
    intent: AgentIntent,
    config: RAGPipelineConfig,
  ): Promise<EvidenceBundle> | EvidenceBundle;
  executeTool(
    request: ToolCallRequest,
  ): Promise<ToolCallResult> | ToolCallResult;
  generateResponse(
    request: ResponseGenerationRequest,
  ): Promise<GeneratedResponse> | GeneratedResponse;
  evaluateRisk?(
    input: {
      context: AgentPipelineContext;
      route: RouteDecision;
      evidence: EvidenceBundle | null;
      tool_requests: readonly ToolCallRequest[];
      tool_results: readonly ToolCallResult[];
      proposed_output: string | null;
    },
  ): Promise<RiskAssessment> | RiskAssessment;
}

export interface AgentRuntimeOptions {
  now?: (() => number) | undefined;
}

export class ResponseGenerationError extends Error {
  constructor(
    readonly code: 'budget_exceeded' | 'provider_failed' | 'timed_out',
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'ResponseGenerationError';
  }
}

export interface GeneratedProposal {
  proposal: ResponseProposal;
  usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  };
}
