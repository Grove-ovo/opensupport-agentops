export type ViewName =
  | 'overview'
  | 'traces'
  | 'approvals'
  | 'releases'
  | 'knowledge'
  | 'tools'
  | 'settings';

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Tenant {
  id: string;
  slug: string;
  display_name: string;
  status: 'active' | 'suspended' | 'archived';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Overview {
  active_conversations: number;
  auto_rate: number;
  approval_backlog: number;
  p95_latency_ms: number;
  daily_cost: number;
  failure_count: number;
  workload: Array<{
    bucket: string;
    traces: number;
    p95_latency_ms: number;
    estimated_cost: number;
  }>;
}

export interface Trace {
  trace_id: string;
  tenant_id: string;
  ticket_id: string;
  conversation_id: string;
  message_id: string;
  runtime_mode: 'shadow' | 'assist' | 'auto';
  execution_state: string;
  intent: string | null;
  route: string | null;
  risk_level: string | null;
  risk_decision: string | null;
  final_action: string | null;
  latency_ms: number | null;
  estimated_cost: number;
  failure_bucket: string | null;
  created_at: string;
  updated_at: string;
}

export interface TraceDetail extends Trace {
  version_snapshot: Record<string, string>;
  retrieved_doc_ids: string[];
  tool_call_ids: string[];
  pii_categories: string[];
  transitions: Array<Record<string, unknown>>;
  llm_calls: Array<Record<string, unknown>>;
  runtime_decision: Record<string, unknown> | null;
  approval: Approval | null;
  deliveries: Array<Record<string, unknown>>;
}

export interface Approval {
  approval_id: string;
  tenant_id: string;
  trace_id: string;
  state: 'pending' | 'approved' | 'edited' | 'rejected' | 'escalated' | 'expired';
  suggested_reply: string;
  evidence_refs: string[];
  tool_result_refs: string[];
  risk_reason: string;
  expires_at: string;
  approver_action: string | null;
  approver_id: string | null;
  edited_reply: string | null;
  edit_distance: number | null;
  action_at: string | null;
  created_at: string;
}

export interface ReleaseCandidate {
  candidate_id: string;
  tenant_id: string;
  state: 'draft' | 'evaluating' | 'failed' | 'shadow' | 'assist' | 'auto' | 'archived';
  agent_version_id: string;
  prompt_version_id: string;
  policy_version_id: string;
  model_config_version_id: string;
  replay_eval_run_id: string;
  security_eval_run_id: string;
  snapshot_hash: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseDetail extends ReleaseCandidate {
  transitions: Array<Record<string, unknown>>;
  gate_result: Record<string, unknown> | null;
  gate_decisions: Array<Record<string, unknown>>;
}

export interface Settings {
  tenant: Tenant;
  model_config: {
    id: string;
    version: number;
    provider: string;
    fast_model: string;
    strong_model: string;
    embedding_model: string;
    fallback_model: string;
    timeout_ms: number;
    max_cost_per_ticket: number;
    daily_budget: number;
    budget_currency: string;
    has_encrypted_api_key: boolean;
  } | null;
  chatwoot: {
    id: string;
    base_url: string;
    account_id: number;
    inbox_id: number | null;
    agent_bot_id: number | null;
    verification_status: string;
    runtime_mode: 'shadow' | 'assist' | 'auto';
    has_webhook_secret: boolean;
    has_api_token: boolean;
    webhook_secret_ref_hint: string | null;
    api_token_ref_hint: string | null;
  } | null;
}

export interface ApiFailure {
  error: { code: string; message: string };
}

export interface OperatorPrincipal {
  subject: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
  tenant_ids: string[];
  admin: boolean;
}

export interface AuthSession {
  principal: OperatorPrincipal;
  csrf_token: string;
  expires_at: number;
}

export interface PolicyVersion {
  id: string;
  tenant_id: string;
  version: number;
  name: string;
  status: 'draft' | 'published' | 'archived';
  content_hash: string;
  document_count: number;
  chunk_count: number;
  published_at: string | null;
  created_at: string;
}

export interface PolicyDocument {
  id: string;
  tenant_id: string;
  policy_version_id: string;
  source_key: string;
  title: string;
  media_type: string;
  content_hash: string;
  chunk_count: number;
  created_at: string;
}

export interface RetrievalSmokeTestResult {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  score: number;
}

export interface ToolManifestEntry {
  name: string;
  version_id: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  timeout_ms: number;
  max_retries: number;
  required_permissions: string[];
  idempotent: boolean;
  dry_run: boolean;
}

export interface RiskRuleEntry {
  gate: string;
  reason_code: string;
  severity: string;
  recommendation: string;
  blocking: boolean;
  description: string;
}

export interface ToolDryRunResult {
  tool_name: string;
  status: 'succeeded' | 'failed' | 'duplicate';
  code: string;
  retryable: boolean;
  dry_run: boolean;
  data: Record<string, unknown> | null;
}
