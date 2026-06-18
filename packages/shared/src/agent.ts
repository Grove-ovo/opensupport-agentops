import type { RuntimeMode, TraceVersionSnapshot } from './trace.js';

export type AgentIntent =
  | 'order_status'
  | 'logistics_query'
  | 'refund_eligibility'
  | 'refund_request'
  | 'return_policy'
  | 'invoice_request'
  | 'complaint_escalation'
  | 'unknown';

export type AgentRoute =
  | 'order'
  | 'logistics'
  | 'refund'
  | 'policy'
  | 'invoice'
  | 'handoff'
  | 'triage';

export type AgentCapability =
  | 'triage_agent'
  | 'rag'
  | 'order_tool'
  | 'logistics_tool'
  | 'refund_tool'
  | 'handoff'
  | 'risk_guardrail'
  | 'response_agent';

export type SensitiveSignal =
  | 'approval_bypass'
  | 'direct_refund_execution'
  | 'credential_disclosure'
  | 'system_prompt_disclosure'
  | 'cross_account_access';

export type RouteReasonCode =
  | 'matched_order_status'
  | 'matched_logistics_query'
  | 'matched_refund_eligibility'
  | 'matched_refund_request'
  | 'matched_return_policy'
  | 'matched_invoice_request'
  | 'matched_complaint_escalation'
  | 'order_id_extracted'
  | 'required_order_id_missing'
  | 'conflicting_intent_signals'
  | 'no_supported_intent';

export interface AgentEntities {
  order_ids: string[];
}

export interface AgentPipelineContext {
  trace_id: string;
  tenant_id: string;
  ticket_id: string;
  conversation_id: string;
  message_id: string;
  masked_text: string;
  runtime_mode: RuntimeMode;
  version_snapshot: TraceVersionSnapshot;
  deadline_at: string;
}

export interface RouteDecision {
  intent: AgentIntent;
  candidate_intents: AgentIntent[];
  confidence: number;
  route: AgentRoute;
  entities: AgentEntities;
  required_capabilities: AgentCapability[];
  sensitive_signals: SensitiveSignal[];
  triage_required: boolean;
  reason_codes: RouteReasonCode[];
}

export type PipelineStepStatus = 'succeeded' | 'degraded' | 'failed';

export interface PipelineStepResult<T> {
  status: PipelineStepStatus;
  data: T | null;
  reason_code: string | null;
  started_at: string;
  completed_at: string;
}
