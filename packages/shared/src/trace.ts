import type { PIICategory } from './pii.js';

export type RuntimeMode = 'shadow' | 'assist' | 'auto';

export type TicketExecutionState =
  | 'received'
  | 'normalized'
  | 'planned'
  | 'waiting_tool'
  | 'waiting_approval'
  | 'replied'
  | 'private_noted'
  | 'handed_off'
  | 'failed';

export interface TraceVersionSnapshot {
  agent_version_id: string;
  prompt_version_id: string;
  policy_version_id: string;
  tool_manifest_version_id: string;
  risk_rule_version_id: string;
  retrieval_config_version_id: string;
  model_config_version_id: string;
}

export interface AgentTrace extends TraceVersionSnapshot {
  trace_id: string;
  tenant_id: string;
  ticket_id: string;
  conversation_id: string;
  message_id: string;
  runtime_mode: RuntimeMode;
  execution_state: TicketExecutionState;
  model_provider: string | null;
  model_name: string | null;
  intent: string | null;
  entities: Record<string, unknown>;
  route: string | null;
  retrieved_doc_ids: string[];
  tool_call_ids: string[];
  risk_level: string | null;
  risk_decision: string | null;
  final_action: string | null;
  latency_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  failure_bucket: string | null;
  pii_categories: PIICategory[];
  pii_replacement_map_ref: string | null;
  masked_input_hash: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
