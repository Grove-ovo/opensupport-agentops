import type {
  AgentIntent,
  PipelineStepResult,
  RouteDecision,
  TriageDecision,
} from './agent.js';
import type { EvidenceBundle } from './evidence.js';
import type { RiskAssessment } from './risk.js';
import type { ToolCallRequest, ToolCallResult } from './tools.js';

export type ResponseAction =
  | 'reply'
  | 'clarify'
  | 'private_note'
  | 'handoff';

export interface ResponseProposal {
  action: ResponseAction;
  text: string | null;
  evidence_refs: string[];
  tool_result_refs: string[];
  model_name: string | null;
  fallback_used: boolean;
  grounded: boolean;
  blocking_reason: string | null;
  delivery_performed: false;
  approval_created: false;
}

export interface GeneratedResponse {
  text: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface PipelineTraceAppend {
  trace_id: string;
  tenant_id: string;
  intent: AgentIntent;
  route: string;
  route_confidence: number;
  evidence_ids: string[];
  evidence_score_max: number | null;
  tool_call_ids: string[];
  tool_result_ids: string[];
  gate_decision_ids: string[];
  model_name: string | null;
  fallback_used: boolean;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  final_recommendation: string;
  final_action: ResponseAction;
  failure_reason: string | null;
}

export interface AgentPipelineRun {
  route: RouteDecision;
  triage: TriageDecision | null;
  evidence: EvidenceBundle | null;
  tool_requests: ToolCallRequest[];
  tool_results: ToolCallResult[];
  risk: RiskAssessment;
  response: ResponseProposal;
  trace_append: PipelineTraceAppend;
  steps: {
    route: PipelineStepResult<RouteDecision>;
    triage: PipelineStepResult<TriageDecision | null>;
    rag: PipelineStepResult<EvidenceBundle | null>;
    tools: PipelineStepResult<ToolCallResult[]>;
    risk: PipelineStepResult<RiskAssessment>;
    response: PipelineStepResult<ResponseProposal>;
  };
}
