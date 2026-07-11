import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type {
  AgentPipelineRun,
  AgentTrace,
  NewLLMCallLog,
  RuntimeMode,
  RuntimeModeConfig,
  RuntimeModeDecision,
  TenantModelConfig,
  TraceVersionSnapshot,
} from '@opensupport/shared';
import type { MockOrderRecord } from '@opensupport/tools';

export interface ChatwootRuntimeConnection {
  id: string;
  tenant_id: string;
  base_url: string;
  account_id: number;
  webhook_secret_ref: string | null;
  api_token_ref: string | null;
  requested_mode: RuntimeMode;
  assignee_id: number | null;
  team_id: number | null;
}

export interface CostSnapshot {
  ticketCost: number;
  dailyCost: number;
}

export interface DeliveryClaimInput {
  deliveryId: string;
  tenantId: string;
  traceId: string;
  conversationId: string;
  messageType: 'private_note' | 'public_reply';
  idempotencyKey: string;
  inputHash: string;
  credentialRefHash: string;
  requestHash: string;
}

export type QueryExecutor = Pool | PoolClient;

export interface DeliveryClaimRecord extends DeliveryClaimInput {
  status: 'pending' | 'succeeded' | 'failed';
  code: string | null;
  providerMessageId: string | null;
  responseHash: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type DeliveryClaimResult =
  | { status: 'claimed'; record: DeliveryClaimRecord }
  | { status: 'duplicate'; record: DeliveryClaimRecord }
  | { status: 'in_flight'; record: DeliveryClaimRecord }
  | { status: 'conflict'; record: DeliveryClaimRecord };

export interface RuntimeAuditInput {
  executionId: string;
  tenantId: string;
  traceId: string;
  canonicalEventId: string;
  runtimeDecisionId: string | null;
  outcome:
    | 'private_noted'
    | 'approval_pending'
    | 'replied'
    | 'handed_off'
    | 'failed';
  approvalId: string | null;
  deliveryId: string | null;
  latencyMs: number;
  estimatedCost: number;
  failureReason: string | null;
  inputHash: string;
}

interface ConnectionRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  base_url: string;
  account_id: string;
  webhook_secret_ref: string | null;
  api_token_ref: string | null;
  metadata: Record<string, unknown>;
}

interface ModelConfigRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  version: number;
  provider: string;
  fast_model: string;
  strong_model: string;
  embedding_model: string;
  fallback_model: string;
  timeout_ms: number;
  max_cost_per_ticket: string;
  daily_budget: string;
  budget_currency: string;
  encrypted_api_key_ref: string;
  is_active: boolean;
  config_fingerprint: string;
}

interface RuntimeConfigRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  version: number;
  allowed_auto_intents: RuntimeModeConfig['allowed_auto_intents'];
  max_auto_risk_severity: RuntimeModeConfig['max_auto_risk_severity'];
  max_auto_latency_ms: number;
  max_auto_cost_per_ticket: string;
  auto_downgrade_mode: RuntimeModeConfig['auto_downgrade_mode'];
  is_active: boolean;
  config_hash: string;
}

interface CostRow extends QueryResultRow {
  cost: string | null;
}

interface MockOrderRow extends QueryResultRow, MockOrderRecord {}

interface DeliveryRow extends QueryResultRow {
  delivery_id: string;
  tenant_id: string;
  trace_id: string;
  conversation_id: string;
  message_type: DeliveryClaimInput['messageType'];
  idempotency_key: string;
  input_hash: string;
  credential_ref_hash: string;
  status: DeliveryClaimRecord['status'];
  code: string | null;
  provider_message_id: string | null;
  request_hash: string;
  response_hash: string | null;
  created_at: string;
  completed_at: string | null;
}

export class ProductionE2ERepository {
  constructor(readonly pool: Pool) {}

  async getChatwootConnection(
    tenantId: string,
    executor: QueryExecutor = this.pool,
  ): Promise<ChatwootRuntimeConnection | null> {
    const result = await executor.query<ConnectionRow>(
      `SELECT
         id, tenant_id, base_url, account_id::text, webhook_secret_ref,
         api_token_ref, metadata
       FROM chatwoot_connections
       WHERE tenant_id = $1 AND is_active
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      base_url: row.base_url,
      account_id: Number(row.account_id),
      webhook_secret_ref: row.webhook_secret_ref,
      api_token_ref: row.api_token_ref,
      requested_mode: readRuntimeMode(row.metadata.runtime_mode),
      assignee_id: readPositiveInteger(row.metadata.assignee_id),
      team_id: readPositiveInteger(row.metadata.team_id),
    };
  }

  async getActiveModelConfig(
    tenantId: string,
  ): Promise<TenantModelConfig | null> {
    const result = await this.pool.query<ModelConfigRow>(
      `SELECT
         id, tenant_id, version, provider, fast_model, strong_model,
         embedding_model, fallback_model, timeout_ms,
         max_cost_per_ticket::text, daily_budget::text, budget_currency,
         encrypted_api_key_ref, is_active, config_fingerprint
       FROM tenant_model_configs
       WHERE tenant_id = $1 AND is_active
       ORDER BY version DESC
       LIMIT 1`,
      [tenantId],
    );
    const row = result.rows[0];
    return row
      ? {
          ...row,
          max_cost_per_ticket: Number(row.max_cost_per_ticket),
          daily_budget: Number(row.daily_budget),
        }
      : null;
  }

  async getActiveRuntimeConfig(
    tenantId: string,
  ): Promise<RuntimeModeConfig | null> {
    const result = await this.pool.query<RuntimeConfigRow>(
      `SELECT
         id, tenant_id, version, allowed_auto_intents,
         max_auto_risk_severity, max_auto_latency_ms,
         max_auto_cost_per_ticket::text, auto_downgrade_mode,
         is_active, config_hash
       FROM runtime_mode_configs
       WHERE tenant_id = $1 AND is_active
       ORDER BY version DESC
       LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ? mapRuntimeConfig(result.rows[0]) : null;
  }

  async getCosts(
    tenantId: string,
    ticketId: string,
    currency: string,
  ): Promise<CostSnapshot> {
    const [ticket, daily] = await Promise.all([
      this.pool.query<CostRow>(
        `SELECT coalesce(sum(estimated_cost), 0)::text AS cost
         FROM llm_call_logs
         WHERE tenant_id = $1 AND ticket_id = $2 AND cost_currency = $3`,
        [tenantId, ticketId, currency],
      ),
      this.pool.query<CostRow>(
        `SELECT coalesce(sum(estimated_cost), 0)::text AS cost
         FROM llm_call_logs
         WHERE tenant_id = $1
           AND cost_currency = $2
           AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
        [tenantId, currency],
      ),
    ]);
    return {
      ticketCost: Number(ticket.rows[0]?.cost ?? 0),
      dailyCost: Number(daily.rows[0]?.cost ?? 0),
    };
  }

  async listMockOrders(
    tenantId: string,
    contactId: string,
  ): Promise<MockOrderRecord[]> {
    const result = await this.pool.query<MockOrderRow>(
      `SELECT
         tenant_id, contact_id, order_id, order_status, logistics_status,
         tracking_number, refund_eligible, refund_reason
       FROM mock_orders
       WHERE tenant_id = $1 AND contact_id = $2
       ORDER BY order_id`,
      [tenantId, contactId],
    );
    return result.rows;
  }

  async insertTrace(trace: AgentTrace): Promise<void> {
    await this.pool.query(
      `INSERT INTO agent_traces (
         trace_id, tenant_id, ticket_id, conversation_id, message_id,
         runtime_mode, execution_state, agent_version_id, prompt_version_id,
         policy_version_id, tool_manifest_version_id, risk_rule_version_id,
         retrieval_config_version_id, model_config_version_id, model_provider,
         model_name, intent, entities, route, retrieved_doc_ids, tool_call_ids,
         risk_level, risk_decision, final_action, latency_ms, input_tokens,
         output_tokens, estimated_cost, failure_bucket, pii_categories,
         pii_replacement_map_ref, masked_input_hash, metadata, created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18::jsonb, $19, $20::jsonb, $21::jsonb, $22, $23,
         $24, $25, $26, $27, $28, $29, $30::text[], $31, $32, $33::jsonb,
         $34, $35
       )`,
      [
        trace.trace_id,
        trace.tenant_id,
        trace.ticket_id,
        trace.conversation_id,
        trace.message_id,
        trace.runtime_mode,
        trace.execution_state,
        trace.agent_version_id,
        trace.prompt_version_id,
        trace.policy_version_id,
        trace.tool_manifest_version_id,
        trace.risk_rule_version_id,
        trace.retrieval_config_version_id,
        trace.model_config_version_id,
        trace.model_provider,
        trace.model_name,
        trace.intent,
        JSON.stringify(trace.entities),
        trace.route,
        JSON.stringify(trace.retrieved_doc_ids),
        JSON.stringify(trace.tool_call_ids),
        trace.risk_level,
        trace.risk_decision,
        trace.final_action,
        trace.latency_ms,
        trace.input_tokens,
        trace.output_tokens,
        trace.estimated_cost,
        trace.failure_bucket,
        trace.pii_categories,
        trace.pii_replacement_map_ref,
        trace.masked_input_hash,
        JSON.stringify(trace.metadata),
        trace.created_at,
        trace.updated_at,
      ],
    );
  }

  async transitionTrace(
    tenantId: string,
    traceId: string,
    expected: string,
    next: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.pool.query(
      `SELECT transition_ticket_execution(
         $1, $2, $3, $4, $5, 'system', NULL, $6, $7, now()
       )`,
      [
        tenantId,
        traceId,
        expected,
        next,
        reason,
        idempotencyKey,
        hashJson({ tenantId, traceId, expected, next, reason }),
      ],
    );
  }

  async appendLLMCallLog(record: NewLLMCallLog): Promise<void> {
    await this.pool.query(
      `INSERT INTO llm_call_logs (
         id, tenant_id, trace_id, model_config_version_id, ticket_id,
         conversation_id, prompt_version_id, model_provider, model_name,
         call_status, input_tokens, output_tokens, input_cost_per_million,
         output_cost_per_million, estimated_cost, cost_currency, latency_ms,
         error_code, budget_reason_code, created_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20
       )`,
      [
        record.id,
        record.tenant_id,
        record.trace_id,
        record.model_config_version_id,
        record.ticket_id,
        record.conversation_id,
        record.prompt_version_id,
        record.model_provider,
        record.model_name,
        record.call_status,
        record.input_tokens,
        record.output_tokens,
        record.input_cost_per_million,
        record.output_cost_per_million,
        record.estimated_cost,
        record.cost_currency,
        record.latency_ms,
        record.error_code,
        record.budget_reason_code,
        record.created_at,
      ],
    );
  }

  async updateTraceFromPipeline(
    traceId: string,
    pipeline: AgentPipelineRun,
    provider: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE agent_traces
       SET
         model_provider = $2,
         model_name = $3,
         intent = $4,
         route = $5,
         retrieved_doc_ids = $6::jsonb,
         tool_call_ids = $7::jsonb,
         risk_level = $8,
         risk_decision = $9,
         final_action = $10,
         latency_ms = $11,
         input_tokens = $12,
         output_tokens = $13,
         estimated_cost = $14,
         failure_bucket = $15,
         updated_at = now()
       WHERE trace_id = $1`,
      [
        traceId,
        provider,
        pipeline.trace_append.model_name,
        pipeline.trace_append.intent,
        pipeline.trace_append.route,
        JSON.stringify(pipeline.trace_append.evidence_ids),
        JSON.stringify(pipeline.trace_append.tool_call_ids),
        pipeline.risk.highest_severity,
        pipeline.risk.recommendation,
        pipeline.trace_append.final_action,
        pipeline.trace_append.latency_ms,
        pipeline.trace_append.input_tokens,
        pipeline.trace_append.output_tokens,
        pipeline.trace_append.estimated_cost,
        pipeline.trace_append.failure_reason,
      ],
    );
  }

  async saveRuntimeDecision(decision: RuntimeModeDecision): Promise<void> {
    await this.pool.query(
      `INSERT INTO runtime_mode_decisions (
         decision_id, tenant_id, trace_id, runtime_config_version_id,
         requested_mode, effective_mode, action, reason_codes, blocking,
         created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10)
       ON CONFLICT (decision_id) DO NOTHING`,
      [
        decision.decision_id,
        decision.tenant_id,
        decision.trace_id,
        decision.runtime_config_version_id,
        decision.requested_mode,
        decision.effective_mode,
        decision.action,
        [...decision.reason_codes],
        decision.blocking,
        decision.created_at,
      ],
    );
  }

  async recordCostCapExceeded(traceId: string): Promise<void> {
    await this.pool.query(
      `UPDATE agent_traces
       SET metadata = metadata || '{"cost_cap_exceeded":true}'::jsonb,
           updated_at = now()
       WHERE trace_id = $1`,
      [traceId],
    );
  }

  async hasBudgetExceeded(traceId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM llm_call_logs
         WHERE trace_id = $1
           AND budget_reason_code IN (
             'ticket_budget_exceeded',
             'daily_budget_exceeded',
             'ticket_and_daily_budget_exceeded'
           )
       ) AS exists`,
      [traceId],
    );
    return result.rows[0]?.exists === true;
  }

  async createApproval(input: {
    approvalId: string;
    tenantId: string;
    traceId: string;
    suggestedReply: string;
    evidenceRefs: readonly string[];
    toolResultRefs: readonly string[];
    riskReason: string;
    snapshot: TraceVersionSnapshot;
    expiresAt: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.pool.query(
      `SELECT create_pending_approval(
         $1, $2, $3, 'planned', $4, $5::text[], $6::text[], $7,
         'public_reply', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
         now()
       )`,
      [
        input.approvalId,
        input.tenantId,
        input.traceId,
        input.suggestedReply,
        [...input.evidenceRefs],
        [...input.toolResultRefs],
        input.riskReason,
        input.snapshot.agent_version_id,
        input.snapshot.prompt_version_id,
        input.snapshot.policy_version_id,
        input.snapshot.tool_manifest_version_id,
        input.snapshot.risk_rule_version_id,
        input.snapshot.retrieval_config_version_id,
        input.snapshot.model_config_version_id,
        input.expiresAt,
        input.idempotencyKey,
        hashJson(input),
      ],
    );
  }

  async claimCanonicalExecution(eventId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE canonical_inbound_events
       SET processing_status = 'processing', processing_started_at = now()
       WHERE id = $1 AND processing_status = 'received'
       RETURNING id`,
      [eventId],
    );
    return result.rowCount === 1;
  }

  async attachTrace(eventId: string, traceId: string): Promise<void> {
    await this.pool.query(
      `UPDATE canonical_inbound_events SET trace_id = $2 WHERE id = $1`,
      [eventId, traceId],
    );
  }

  async completeCanonicalExecution(
    eventId: string,
    status: 'completed' | 'failed',
    errorCode: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE canonical_inbound_events
       SET processing_status = $2, error_code = $3, processed_at = now()
       WHERE id = $1 AND processing_status = 'processing'`,
      [eventId, status, errorCode],
    );
  }

  async claimDelivery(
    input: DeliveryClaimInput,
    executor: QueryExecutor = this.pool,
  ): Promise<DeliveryClaimResult> {
    const inserted = await executor.query<DeliveryRow>(
      `INSERT INTO chatwoot_delivery_attempts (
         delivery_id, tenant_id, trace_id, conversation_id, message_type,
         idempotency_key, input_hash, credential_ref_hash, request_hash
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        input.deliveryId,
        input.tenantId,
        input.traceId,
        input.conversationId,
        input.messageType,
        input.idempotencyKey,
        input.inputHash,
        input.credentialRefHash,
        input.requestHash,
      ],
    );
    if (inserted.rows[0]) {
      return { status: 'claimed', record: mapDelivery(inserted.rows[0]) };
    }
    const existing = await executor.query<DeliveryRow>(
      `SELECT * FROM chatwoot_delivery_attempts
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [input.tenantId, input.idempotencyKey],
    );
    const record = mapDelivery(required(existing.rows[0], 'delivery'));
    if (record.inputHash !== input.inputHash) {
      return { status: 'conflict', record };
    }
    if (record.status === 'succeeded') {
      return { status: 'duplicate', record };
    }
    if (record.status === 'failed') {
      const retried = await executor.query<DeliveryRow>(
        `UPDATE chatwoot_delivery_attempts
         SET status = 'pending',
             code = NULL,
             provider_message_id = NULL,
             credential_ref_hash = $3,
             request_hash = $4,
             response_hash = NULL,
             attempt_count = attempt_count + 1,
             completed_at = NULL
         WHERE tenant_id = $1
           AND idempotency_key = $2
           AND status = 'failed'
         RETURNING *`,
        [
          input.tenantId,
          input.idempotencyKey,
          input.credentialRefHash,
          input.requestHash,
        ],
      );
      if (retried.rows[0]) {
        return { status: 'claimed', record: mapDelivery(retried.rows[0]) };
      }
    }
    return { status: 'in_flight', record };
  }

  async completeDelivery(
    deliveryId: string,
    status: 'succeeded' | 'failed',
    code: string,
    providerMessageId: string | null,
    responseHash: string | null,
    executor: QueryExecutor = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE chatwoot_delivery_attempts
       SET status = $2, code = $3, provider_message_id = $4,
           response_hash = $5, completed_at = now()
       WHERE delivery_id = $1 AND status = 'pending'`,
      [deliveryId, status, code, providerMessageId, responseHash],
    );
  }

  async saveRuntimeAudit(input: RuntimeAuditInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO runtime_execution_audits (
         execution_id, tenant_id, trace_id, canonical_event_id,
         runtime_decision_id, outcome, approval_id, delivery_id,
         latency_ms, estimated_cost, failure_reason, input_hash
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (execution_id) DO NOTHING`,
      [
        input.executionId,
        input.tenantId,
        input.traceId,
        input.canonicalEventId,
        input.runtimeDecisionId,
        input.outcome,
        input.approvalId,
        input.deliveryId,
        input.latencyMs,
        input.estimatedCost,
        input.failureReason,
        input.inputHash,
      ],
    );
  }
}

function mapRuntimeConfig(row: RuntimeConfigRow): RuntimeModeConfig {
  return {
    ...row,
    max_auto_cost_per_ticket: Number(row.max_auto_cost_per_ticket),
  };
}

function mapDelivery(row: DeliveryRow): DeliveryClaimRecord {
  return {
    deliveryId: row.delivery_id,
    tenantId: row.tenant_id,
    traceId: row.trace_id,
    conversationId: row.conversation_id,
    messageType: row.message_type,
    idempotencyKey: row.idempotency_key,
    inputHash: row.input_hash,
    credentialRefHash: row.credential_ref_hash,
    requestHash: row.request_hash,
    status: row.status,
    code: row.code,
    providerMessageId: row.provider_message_id,
    responseHash: row.response_hash,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function readRuntimeMode(value: unknown): RuntimeMode {
  return value === 'assist' || value === 'auto' ? value : 'shadow';
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export function newExecutionId(): string {
  return randomUUID();
}
