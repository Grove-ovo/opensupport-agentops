import type {
  AgentPipelineContext,
  EvidenceBundle,
  GateDecision,
  RouteDecision,
  ToolCallRequest,
  ToolCallResult,
} from '@opensupport/shared';

export interface GuardrailInput {
  context: AgentPipelineContext;
  route_decision: RouteDecision;
  evidence_bundle: EvidenceBundle | null;
  tool_requests: readonly ToolCallRequest[];
  tool_results: readonly ToolCallResult[];
  proposed_output: string | null;
}

export interface GuardrailOptions {
  now?: Date | string | undefined;
}

export interface ModelRiskJudge {
  evaluate(
    input: Readonly<GuardrailInput>,
  ): Promise<readonly GateDecision[]> | readonly GateDecision[];
}
