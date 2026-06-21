import type {
  ApprovalState,
  CanonicalInboundEvent,
  ReleaseCandidateState,
  RuntimeMode,
  TicketExecutionState,
} from '@opensupport/shared';

export interface PageQuery {
  limit: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface TenantRecord {
  id: string;
  slug: string;
  display_name: string;
  status: 'active' | 'suspended' | 'archived';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SafeModelConfigRecord {
  id: string;
  tenant_id: string;
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
  is_active: boolean;
  config_fingerprint: string;
  has_encrypted_api_key: boolean;
  created_at: string;
}

export interface TraceSummaryRecord {
  trace_id: string;
  tenant_id: string;
  ticket_id: string;
  conversation_id: string;
  message_id: string;
  runtime_mode: RuntimeMode;
  execution_state: TicketExecutionState;
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

export interface ApprovalSummaryRecord {
  approval_id: string;
  tenant_id: string;
  trace_id: string;
  state: ApprovalState;
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

export interface ReleaseCandidateSummaryRecord {
  candidate_id: string;
  tenant_id: string;
  state: ReleaseCandidateState;
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

export interface DashboardOverviewRecord {
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

export interface TraceDetailRecord extends TraceSummaryRecord {
  version_snapshot: {
    agent_version_id: string;
    prompt_version_id: string;
    policy_version_id: string;
    tool_manifest_version_id: string;
    risk_rule_version_id: string;
    retrieval_config_version_id: string;
    model_config_version_id: string;
  };
  retrieved_doc_ids: string[];
  tool_call_ids: string[];
  pii_categories: string[];
  transitions: Array<Record<string, unknown>>;
  llm_calls: Array<Record<string, unknown>>;
  runtime_decision: Record<string, unknown> | null;
  approval: ApprovalSummaryRecord | null;
  deliveries: Array<Record<string, unknown>>;
}

export interface ReleaseCandidateDetailRecord
  extends ReleaseCandidateSummaryRecord {
  transitions: Array<Record<string, unknown>>;
  gate_result: Record<string, unknown> | null;
  gate_decisions: Array<Record<string, unknown>>;
}

export interface OperationsSettingsRecord {
  tenant: TenantRecord;
  model_config: SafeModelConfigRecord | null;
  chatwoot: {
    id: string;
    base_url: string;
    account_id: number;
    inbox_id: number | null;
    agent_bot_id: number | null;
    verification_status: string;
    runtime_mode: RuntimeMode;
    has_webhook_secret: boolean;
    has_api_token: boolean;
    webhook_secret_ref_hint: string | null;
    api_token_ref_hint: string | null;
  } | null;
}

export interface ApprovalActionCommand {
  tenantId: string;
  approvalId: string;
  action: 'approve' | 'edit' | 'reject' | 'escalate';
  actorId: string;
  editedReply: string | null;
  idempotencyKey: string;
}

export interface ReleaseTransitionCommand {
  tenantId: string;
  candidateId: string;
  action: 'start_evaluation' | 'archive';
  actorId: string;
  idempotencyKey: string;
}

export interface OperationsService {
  getOverview(tenantId: string): Promise<DashboardOverviewRecord>;
  getTrace(tenantId: string, traceId: string): Promise<TraceDetailRecord | null>;
  applyApprovalAction(
    command: ApprovalActionCommand,
  ): Promise<ApprovalSummaryRecord>;
  getRelease(
    tenantId: string,
    candidateId: string,
  ): Promise<ReleaseCandidateDetailRecord | null>;
  transitionRelease(
    command: ReleaseTransitionCommand,
  ): Promise<ReleaseCandidateDetailRecord>;
  getSettings(tenantId: string): Promise<OperationsSettingsRecord | null>;
  updateTenant(
    tenantId: string,
    input: {
      displayName: string;
      status: TenantRecord['status'];
      metadata: Record<string, unknown>;
      actorId: string;
    },
  ): Promise<TenantRecord>;
  updateModelConfig(
    tenantId: string,
    input: {
      provider: string;
      fastModel: string;
      strongModel: string;
      embeddingModel: string;
      fallbackModel: string;
      timeoutMs: number;
      maxCostPerTicket: number;
      dailyBudget: number;
      budgetCurrency: string;
      replacementApiKey: string | null;
      actorId: string;
    },
  ): Promise<SafeModelConfigRecord>;
  updateChatwoot(
    tenantId: string,
    input: {
      baseUrl: string;
      accountId: number;
      inboxId: number | null;
      agentBotId: number | null;
      runtimeMode: RuntimeMode;
      webhookSecretRef: string | null;
      apiTokenRef: string | null;
      actorId: string;
    },
  ): Promise<OperationsSettingsRecord['chatwoot']>;
}

export interface CanonicalEventRecord extends CanonicalInboundEvent {
  id: string;
  delivery_keys: string[];
  decision: 'pipeline_seeded' | 'duplicate' | 'audit_only';
  trace_id: string | null;
  received_at: string;
  processing_status: 'received' | 'processing' | 'completed' | 'failed';
  error_code: string | null;
  processing_started_at: string | null;
  processed_at: string | null;
}

export interface CanonicalEventCreateInput {
  event: CanonicalInboundEvent;
  deliveryKeys: readonly string[];
  decision: CanonicalEventRecord['decision'];
}

export interface CanonicalEventCreateResult {
  status: 'created' | 'duplicate';
  record: CanonicalEventRecord;
}

export interface ReadinessStatus {
  postgres: boolean;
  redis: boolean;
  migration: number;
  required_migration: number;
}

export interface AgentOpsStore {
  ping(): Promise<void>;
  close(): Promise<void>;
  getMigrationVersion(): Promise<number>;
  listTenants(query: PageQuery): Promise<Page<TenantRecord>>;
  getTenant(tenantId: string): Promise<TenantRecord | null>;
  getActiveModelConfig(tenantId: string): Promise<SafeModelConfigRecord | null>;
  listTraces(
    tenantId: string,
    query: PageQuery,
  ): Promise<Page<TraceSummaryRecord>>;
  listApprovals(
    tenantId: string,
    state: ApprovalState | null,
    query: PageQuery,
  ): Promise<Page<ApprovalSummaryRecord>>;
  listReleaseCandidates(
    tenantId: string,
    state: ReleaseCandidateState | null,
    query: PageQuery,
  ): Promise<Page<ReleaseCandidateSummaryRecord>>;
  createOrGetCanonicalEvent(
    input: CanonicalEventCreateInput,
  ): Promise<CanonicalEventCreateResult>;
}

export interface RedisCoordinator {
  ping(): Promise<void>;
  close(): Promise<void>;
  claimDedupeKeys(keys: readonly string[], ttlSeconds: number): Promise<boolean>;
  acquireLock(
    key: string,
    ttlMilliseconds: number,
  ): Promise<{ token: string; release(): Promise<boolean> } | null>;
}

export interface AppDependencies {
  store: AgentOpsStore;
  redis: RedisCoordinator;
  requiredMigration: number;
  dedupeTtlSeconds: number;
  buildVersion: string;
  closeDependencies?: boolean;
  chatwootIngress?: ChatwootIngressHandler;
  operations?: OperationsService;
}

export interface ChatwootIngressRequest {
  tenantId: string;
  source: 'agent_bot' | 'account_webhook';
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  rawBody: string;
}

export interface ChatwootIngressResult {
  status: 202 | 400 | 401 | 503;
  body: Record<string, unknown>;
}

export interface ChatwootIngressHandler {
  handle(request: ChatwootIngressRequest): Promise<ChatwootIngressResult>;
}
