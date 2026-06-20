export type GateName = 'input' | 'retrieval' | 'tool' | 'output';

export type GateSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export type GateRecommendation =
  | 'allow'
  | 'sanitize'
  | 'block'
  | 'clarify'
  | 'handoff';

export type GateReasonCode =
  | 'safe'
  | 'prompt_injection'
  | 'approval_bypass'
  | 'credential_request'
  | 'system_prompt_request'
  | 'unauthorized_order_access'
  | 'retrieval_no_evidence'
  | 'retrieval_conflict'
  | 'retrieval_injected_document'
  | 'retrieval_stale_version'
  | 'unsafe_tool_intent'
  | 'tool_permission_denied'
  | 'tool_timeout'
  | 'pii_leak'
  | 'output_no_evidence_claim';

export interface GateDecision {
  decision_id: string;
  tenant_id: string;
  trace_id: string;
  risk_rule_version_id: string;
  gate_name: GateName;
  decision: GateRecommendation;
  reason_code: GateReasonCode;
  severity: GateSeverity;
  blocking: boolean;
  input_hash: string;
  created_at: string;
}

export interface RiskAssessment {
  tenant_id: string;
  trace_id: string;
  risk_rule_version_id: string;
  decisions: readonly GateDecision[];
  blocking: boolean;
  highest_severity: GateSeverity;
  recommendation: GateRecommendation;
}
