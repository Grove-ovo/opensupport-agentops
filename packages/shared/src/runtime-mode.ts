import type { AgentIntent } from './agent.js';
import type { AgentPipelineRun } from './response.js';
import type { GateSeverity } from './risk.js';
import type { RuntimeMode } from './trace.js';

export type RuntimeModeAction =
  | 'private_note'
  | 'create_approval'
  | 'public_reply'
  | 'handoff';

export type RuntimeModeReasonCode =
  | 'shadow_required'
  | 'assist_required'
  | 'auto_allowed'
  | 'risk_blocking'
  | 'risk_above_auto_threshold'
  | 'intent_not_auto_allowed'
  | 'grounding_missing'
  | 'proposal_unavailable'
  | 'ticket_budget_exceeded'
  | 'daily_budget_exceeded'
  | 'latency_exceeded';

export interface RuntimeModeConfig {
  id: string;
  tenant_id: string;
  version: number;
  allowed_auto_intents: AgentIntent[];
  max_auto_risk_severity: GateSeverity;
  max_auto_latency_ms: number;
  max_auto_cost_per_ticket: number;
  auto_downgrade_mode: Exclude<RuntimeMode, 'auto'>;
  is_active: boolean;
  config_hash: string;
}

export interface RuntimeModeDecisionInput {
  requested_mode: RuntimeMode;
  pipeline: AgentPipelineRun;
  config: RuntimeModeConfig;
  daily_budget_exceeded: boolean;
}

export interface RuntimeModeDecision {
  decision_id: string;
  tenant_id: string;
  trace_id: string;
  runtime_config_version_id: string;
  requested_mode: RuntimeMode;
  effective_mode: RuntimeMode;
  action: RuntimeModeAction;
  reason_codes: readonly RuntimeModeReasonCode[];
  blocking: boolean;
  created_at: string;
}
