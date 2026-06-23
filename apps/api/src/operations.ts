import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { createTenantModelConfig, decryptApiKey, parseMasterKey } from '@opensupport/model-config';
import { createPolicyIngestionPlan } from '@opensupport/retrieval';
import type { ChatwootDeliveryCommand, RuntimeMode } from '@opensupport/shared';
import {
  ChatwootConversationService,
  PersistentChatwootDeliveryService,
} from './chatwoot-delivery.js';
import type {
  ApprovalActionCommand,
  ApprovalSummaryRecord,
  DashboardOverviewRecord,
  OperationsService,
  OperationsSettingsRecord,
  PolicyDocumentSummaryRecord,
  PolicyVersionSummaryRecord,
  ReleaseCandidateDetailRecord,
  ReleaseTransitionCommand,
  RetrievalSmokeTestResult,
  SafeModelConfigRecord,
  TenantRecord,
  TraceDetailRecord,
} from './contracts.js';
import { ProductionE2ERepository } from './e2e-repository.js';
import type { EnvironmentSecretResolver } from './secrets.js';

interface ApprovalActionRow extends QueryResultRow {
  action_id: string;
}

interface ReleaseTransitionRow extends QueryResultRow {
  transition_id: string;
}

export class OperationsError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: 400 | 404 | 409 | 502 | 503,
  ) {
    super(code);
    this.name = 'OperationsError';
  }
}

export class PostgresOperationsService implements OperationsService {
  readonly repository: ProductionE2ERepository;
  readonly delivery: PersistentChatwootDeliveryService;
  readonly conversations: ChatwootConversationService;

  constructor(
    readonly pool: Pool,
    secrets: EnvironmentSecretResolver,
    readonly masterKeyReference: string,
    readonly masterKeyId: string,
  ) {
    this.repository = new ProductionE2ERepository(pool);
    this.delivery = new PersistentChatwootDeliveryService(this.repository, secrets);
    this.conversations = new ChatwootConversationService(secrets);
  }

  async getOverview(tenantId: string): Promise<DashboardOverviewRecord> {
    const aggregate = await this.pool.query<QueryResultRow>(
      `SELECT values
       FROM operational_aggregates
       WHERE tenant_id = $1
         AND aggregate_name = 'dashboard_overview_24h'
       ORDER BY window_end DESC
       LIMIT 1`,
      [tenantId],
    );
    const values = asRecord(aggregate.rows[0]?.values) ?? {};
    const workload = Array.isArray(values.workload) ? values.workload : [];
    return {
      active_conversations: Number(values.active_conversations ?? 0),
      auto_rate: Number(values.auto_rate ?? 0),
      approval_backlog: Number(values.approval_backlog ?? 0),
      p95_latency_ms: Number(values.p95_latency_ms ?? 0),
      daily_cost: Number(values.daily_cost ?? 0),
      failure_count: Number(values.failure_count ?? 0),
      workload: workload.flatMap((item) => {
        const point = asRecord(item);
        return point
          ? [{
              bucket: String(point.bucket),
              traces: Number(point.traces),
              p95_latency_ms: Number(point.p95_latency_ms),
              estimated_cost: Number(point.estimated_cost),
            }]
          : [];
      }),
    };
  }

  async getTrace(
    tenantId: string,
    traceId: string,
  ): Promise<TraceDetailRecord | null> {
    const trace = await this.pool.query<QueryResultRow>(
      `SELECT
         trace_id, tenant_id, ticket_id, conversation_id, message_id,
         runtime_mode, execution_state, intent, route, risk_level,
         risk_decision, final_action, latency_ms, estimated_cost::text,
         failure_bucket, created_at, updated_at,
         agent_version_id, prompt_version_id, policy_version_id,
         tool_manifest_version_id, risk_rule_version_id,
         retrieval_config_version_id, model_config_version_id::text,
         retrieved_doc_ids, tool_call_ids, pii_categories
       FROM agent_traces
       WHERE tenant_id = $1 AND trace_id = $2`,
      [tenantId, traceId],
    );
    const row = trace.rows[0];
    if (!row) return null;
    const [transitions, llmCalls, decision, approval, deliveries] =
      await Promise.all([
        this.pool.query(
          `SELECT transition_id, from_state, to_state, reason_code,
                  actor_type, actor_id, created_at
           FROM ticket_execution_transitions
           WHERE tenant_id = $1 AND trace_id = $2
           ORDER BY created_at`,
          [tenantId, traceId],
        ),
        this.pool.query(
          `SELECT id, model_provider, model_name, call_status, input_tokens,
                  output_tokens, estimated_cost::text, latency_ms, error_code,
                  budget_reason_code, created_at
           FROM llm_call_logs
           WHERE tenant_id = $1 AND trace_id = $2
           ORDER BY created_at`,
          [tenantId, traceId],
        ),
        this.pool.query(
          `SELECT decision_id, requested_mode, effective_mode, action,
                  reason_codes, blocking, created_at
           FROM runtime_mode_decisions
           WHERE tenant_id = $1 AND trace_id = $2
           ORDER BY created_at DESC LIMIT 1`,
          [tenantId, traceId],
        ),
        this.pool.query(
          `SELECT approval_id, tenant_id, trace_id, state, suggested_reply,
                  evidence_refs, tool_result_refs, risk_reason, expires_at,
                  approver_action, approver_id, edited_reply,
                  edit_distance::text, action_at, created_at
           FROM approval_requests
           WHERE tenant_id = $1 AND trace_id = $2`,
          [tenantId, traceId],
        ),
        this.pool.query(
          `SELECT delivery_id, message_type, status, code, provider_message_id,
                  attempt_count, created_at, completed_at
           FROM chatwoot_delivery_attempts
           WHERE tenant_id = $1 AND trace_id = $2
           ORDER BY created_at`,
          [tenantId, traceId],
        ),
      ]);
    const approvalRow = approval.rows[0];
    return {
      trace_id: String(row.trace_id),
      tenant_id: String(row.tenant_id),
      ticket_id: String(row.ticket_id),
      conversation_id: String(row.conversation_id),
      message_id: String(row.message_id),
      runtime_mode: row.runtime_mode as TraceDetailRecord['runtime_mode'],
      execution_state: row.execution_state as TraceDetailRecord['execution_state'],
      intent: nullableString(row.intent),
      route: nullableString(row.route),
      risk_level: nullableString(row.risk_level),
      risk_decision: nullableString(row.risk_decision),
      final_action: nullableString(row.final_action),
      latency_ms: nullableNumber(row.latency_ms),
      estimated_cost: Number(row.estimated_cost ?? 0),
      failure_bucket: nullableString(row.failure_bucket),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      version_snapshot: {
        agent_version_id: String(row.agent_version_id),
        prompt_version_id: String(row.prompt_version_id),
        policy_version_id: String(row.policy_version_id),
        tool_manifest_version_id: String(row.tool_manifest_version_id),
        risk_rule_version_id: String(row.risk_rule_version_id),
        retrieval_config_version_id: String(row.retrieval_config_version_id),
        model_config_version_id: String(row.model_config_version_id),
      },
      retrieved_doc_ids: stringArray(row.retrieved_doc_ids),
      tool_call_ids: stringArray(row.tool_call_ids),
      pii_categories: stringArray(row.pii_categories),
      transitions: transitions.rows,
      llm_calls: llmCalls.rows.map((call) => ({
        ...call,
        estimated_cost: Number(call.estimated_cost ?? 0),
      })),
      runtime_decision: decision.rows[0] ?? null,
      approval: approvalRow ? mapApproval(approvalRow) : null,
      deliveries: deliveries.rows,
    };
  }

  async applyApprovalAction(
    command: ApprovalActionCommand,
  ): Promise<ApprovalSummaryRecord> {
    const approval = await this.loadApproval(command.tenantId, command.approvalId);
    if (approval === null) {
      throw new OperationsError('approval_not_found', 404);
    }
    if (approval.state !== 'pending') {
      throw new OperationsError('approval_not_pending', 409);
    }
    const content =
      command.action === 'edit'
        ? command.editedReply?.trim() ?? ''
        : approval.suggested_reply;
    let deliveryReceiptId: string | null = null;
    let providerMessageId: string | null = null;
    let deliveryStatus: string | null = null;
    if (command.action === 'approve' || command.action === 'edit') {
      if (content.length === 0) {
        throw new OperationsError('edited_reply_required', 400);
      }
      const connection = await this.repository.getChatwootConnection(command.tenantId);
      if (connection === null) {
        throw new OperationsError('chatwoot_connection_unavailable', 503);
      }
      const conversationId = await this.traceConversation(
        command.tenantId,
        approval.trace_id,
      );
      const deliveryId = randomUUID();
      const delivery = await this.delivery.deliver(
        approvalDeliveryCommand(
          deliveryId,
          approval,
          conversationId,
          content,
          command.idempotencyKey,
        ),
        connection,
      );
      if (delivery.status !== 'succeeded' && delivery.status !== 'duplicate') {
        throw new OperationsError(`chatwoot_${delivery.code}`, 502);
      }
      deliveryReceiptId = delivery.receipt_id;
      providerMessageId = delivery.provider_message_id;
      deliveryStatus = delivery.status;
    }

    const inputHash = hashJson(command);
    await this.pool.query<ApprovalActionRow>(
      `SELECT * FROM apply_approval_action(
         $1, $2, $3, $4, 'pending', $5, 'operator', $6, $7,
         $8, $9, $10, $11, $12, now()
       )`,
      [
        randomUUID(),
        command.approvalId,
        command.tenantId,
        approval.trace_id,
        command.action,
        command.actorId,
        command.action === 'edit' ? content : null,
        deliveryReceiptId,
        providerMessageId,
        deliveryStatus,
        command.idempotencyKey,
        inputHash,
      ],
    );
    if (command.action === 'escalate') {
      const connection = await this.repository.getChatwootConnection(command.tenantId);
      if (connection !== null) {
        try {
          await this.conversations.handoff(
            connection,
            await this.traceConversation(command.tenantId, approval.trace_id),
            new Date(Date.now() + 10_000).toISOString(),
          );
        } catch {
          await this.audit(
            command.tenantId,
            command.actorId,
            'approval_handoff_failed',
            command.approvalId,
            inputHash,
          );
        }
      }
    }
    return required(
      await this.loadApproval(command.tenantId, command.approvalId),
      'approval',
    );
  }

  async getRelease(
    tenantId: string,
    candidateId: string,
  ): Promise<ReleaseCandidateDetailRecord | null> {
    const candidate = await this.pool.query<QueryResultRow>(
      `SELECT
         candidate_id, tenant_id, state, agent_version_id, prompt_version_id,
         policy_version_id, model_config_version_id, replay_eval_run_id,
         security_eval_run_id, snapshot_hash, created_at, updated_at
       FROM release_candidates
       WHERE tenant_id = $1 AND candidate_id = $2`,
      [tenantId, candidateId],
    );
    const row = candidate.rows[0];
    if (!row) return null;
    const [transitions, result, decisions] = await Promise.all([
      this.pool.query(
        `SELECT transition_id, from_state, to_state, reason_code,
                actor_type, actor_id, created_at
         FROM release_candidate_transitions
         WHERE tenant_id = $1 AND candidate_id = $2
         ORDER BY created_at`,
        [tenantId, candidateId],
      ),
      this.pool.query(
        `SELECT result_id, promotion_state, candidate_snapshot_hash,
                created_at
         FROM release_gate_results
         WHERE tenant_id = $1 AND candidate_id = $2`,
        [tenantId, candidateId],
      ),
      this.pool.query(
        `SELECT gate_name, decision, actual_value, threshold_operator,
                threshold_value, reason_code, severity, blocking,
                promotion_ceiling, created_at
         FROM release_gate_decisions
         WHERE tenant_id = $1 AND candidate_id = $2
         ORDER BY gate_name`,
        [tenantId, candidateId],
      ),
    ]);
    return {
      candidate_id: String(row.candidate_id),
      tenant_id: String(row.tenant_id),
      state: row.state as ReleaseCandidateDetailRecord['state'],
      agent_version_id: String(row.agent_version_id),
      prompt_version_id: String(row.prompt_version_id),
      policy_version_id: String(row.policy_version_id),
      model_config_version_id: String(row.model_config_version_id),
      replay_eval_run_id: String(row.replay_eval_run_id),
      security_eval_run_id: String(row.security_eval_run_id),
      snapshot_hash: String(row.snapshot_hash),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      transitions: transitions.rows,
      gate_result: result.rows[0] ?? null,
      gate_decisions: decisions.rows,
    };
  }

  async transitionRelease(
    command: ReleaseTransitionCommand,
  ): Promise<ReleaseCandidateDetailRecord> {
    const candidate = await this.getRelease(command.tenantId, command.candidateId);
    if (candidate === null) {
      throw new OperationsError('release_candidate_not_found', 404);
    }
    const next =
      command.action === 'start_evaluation'
        ? {
            expected: 'draft',
            state: 'evaluating',
            reason: 'evaluation_started',
          }
        : {
            expected: candidate.state,
            state: 'archived',
            reason: 'candidate_archived',
          };
    if (
      (command.action === 'start_evaluation' && candidate.state !== 'draft') ||
      (command.action === 'archive' &&
        !['failed', 'shadow', 'assist', 'auto'].includes(candidate.state))
    ) {
      throw new OperationsError('release_transition_not_allowed', 409);
    }
    const inputHash = hashJson(command);
    await this.pool.query<ReleaseTransitionRow>(
      `SELECT * FROM transition_release_candidate(
         $1, $2, $3, $4, $5, 'operator', $6, $7, $8, now()
       )`,
      [
        command.tenantId,
        command.candidateId,
        next.expected,
        next.state,
        next.reason,
        command.actorId,
        command.idempotencyKey,
        inputHash,
      ],
    );
    await this.audit(
      command.tenantId,
      command.actorId,
      `release_${command.action}`,
      command.candidateId,
      inputHash,
    );
    return required(
      await this.getRelease(command.tenantId, command.candidateId),
      'release candidate',
    );
  }

  async getSettings(
    tenantId: string,
  ): Promise<OperationsSettingsRecord | null> {
    const tenant = await this.loadTenant(tenantId);
    if (tenant === null) return null;
    const [model, connection] = await Promise.all([
      this.loadSafeModelConfig(tenantId),
      this.loadSafeChatwoot(tenantId),
    ]);
    return { tenant, model_config: model, chatwoot: connection };
  }

  async updateTenant(
    tenantId: string,
    input: {
      displayName: string;
      status: TenantRecord['status'];
      metadata: Record<string, unknown>;
      actorId: string;
    },
  ): Promise<TenantRecord> {
    const displayName = input.displayName.trim();
    if (displayName.length === 0 || displayName.length > 200) {
      throw new OperationsError('invalid_display_name', 400);
    }
    const result = await this.pool.query<QueryResultRow>(
      `UPDATE tenants
       SET display_name = $2, status = $3, metadata = $4::jsonb
       WHERE id = $1
       RETURNING id, slug, display_name, status, metadata, created_at, updated_at`,
      [tenantId, displayName, input.status, JSON.stringify(input.metadata)],
    );
    if (!result.rows[0]) throw new OperationsError('tenant_not_found', 404);
    await this.audit(
      tenantId,
      input.actorId,
      'tenant_settings_updated',
      tenantId,
      hashJson(input),
    );
    return result.rows[0] as TenantRecord;
  }

  async updateModelConfig(
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
  ): Promise<SafeModelConfigRecord> {
    const client = await this.pool.connect();
    const masterKey = parseMasterKey(this.masterKeyReference);
    try {
      await client.query('BEGIN');
      const existing = await client.query<QueryResultRow>(
        `SELECT *
         FROM tenant_model_configs
         WHERE tenant_id = $1 AND is_active
         ORDER BY version DESC
         LIMIT 1
         FOR UPDATE`,
        [tenantId],
      );
      const active = existing.rows[0];
      if (!active) throw new OperationsError('model_config_not_found', 404);
      const apiKey =
        input.replacementApiKey?.trim() ||
        decryptApiKey({
          encryptedReference: String(active.encrypted_api_key_ref),
          masterKey,
          tenantId,
          provider: String(active.provider),
        });
      const next = createTenantModelConfig(
        {
          tenantId,
          version: Number(active.version) + 1,
          provider: input.provider,
          fastModel: input.fastModel,
          strongModel: input.strongModel,
          embeddingModel: input.embeddingModel,
          fallbackModel: input.fallbackModel,
          timeoutMs: input.timeoutMs,
          maxCostPerTicket: input.maxCostPerTicket,
          dailyBudget: input.dailyBudget,
          budgetCurrency: input.budgetCurrency,
          apiKey,
        },
        { masterKey, keyId: this.masterKeyId },
      );
      await client.query(
        `UPDATE tenant_model_configs SET is_active = false
         WHERE tenant_id = $1 AND is_active`,
        [tenantId],
      );
      await insertModelConfig(client, next);
      await client.query('COMMIT');
      await this.audit(
        tenantId,
        input.actorId,
        'model_config_version_created',
        next.id,
        hashJson({ ...input, replacementApiKey: input.replacementApiKey !== null }),
      );
      return required(await this.loadSafeModelConfig(tenantId), 'model config');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      masterKey.fill(0);
      client.release();
    }
  }

  async updateChatwoot(
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
  ): Promise<OperationsSettingsRecord['chatwoot']> {
    validateSecretReference(input.webhookSecretRef);
    validateSecretReference(input.apiTokenRef);
    const existing = await this.pool.query<QueryResultRow>(
      `SELECT id, webhook_secret_ref, api_token_ref, metadata
       FROM chatwoot_connections
       WHERE tenant_id = $1 AND is_active
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    );
    const row = existing.rows[0];
    if (!row) throw new OperationsError('chatwoot_connection_not_found', 404);
    const metadata = {
      ...(asRecord(row.metadata) ?? {}),
      runtime_mode: input.runtimeMode,
    };
    await this.pool.query(
      `UPDATE chatwoot_connections
       SET base_url = $2, account_id = $3, inbox_id = $4, agent_bot_id = $5,
           webhook_secret_ref = $6, api_token_ref = $7, metadata = $8::jsonb
       WHERE id = $1`,
      [
        row.id,
        normalizeHttpUrl(input.baseUrl),
        input.accountId,
        input.inboxId,
        input.agentBotId,
        input.webhookSecretRef ?? row.webhook_secret_ref,
        input.apiTokenRef ?? row.api_token_ref,
        JSON.stringify(metadata),
      ],
    );
    await this.audit(
      tenantId,
      input.actorId,
      'chatwoot_connection_updated',
      String(row.id),
      hashJson({
        ...input,
        webhookSecretRef: input.webhookSecretRef !== null,
        apiTokenRef: input.apiTokenRef !== null,
      }),
    );
    return required(await this.loadSafeChatwoot(tenantId), 'chatwoot connection');
  }

  private async loadTenant(tenantId: string): Promise<TenantRecord | null> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT id, slug, display_name, status, metadata, created_at, updated_at
       FROM tenants WHERE id = $1`,
      [tenantId],
    );
    return (result.rows[0] as TenantRecord | undefined) ?? null;
  }

  private async loadSafeModelConfig(
    tenantId: string,
  ): Promise<SafeModelConfigRecord | null> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT
         id, tenant_id, version, provider, fast_model, strong_model,
         embedding_model, fallback_model, timeout_ms,
         max_cost_per_ticket::text, daily_budget::text, budget_currency,
         is_active, config_fingerprint,
         encrypted_api_key_ref IS NOT NULL AS has_encrypted_api_key,
         created_at
       FROM tenant_model_configs
       WHERE tenant_id = $1 AND is_active
       ORDER BY version DESC LIMIT 1`,
      [tenantId],
    );
    const row = result.rows[0];
    return row
      ? {
          ...(row as Omit<
            SafeModelConfigRecord,
            'max_cost_per_ticket' | 'daily_budget'
          >),
          max_cost_per_ticket: Number(row.max_cost_per_ticket),
          daily_budget: Number(row.daily_budget),
        }
      : null;
  }

  private async loadSafeChatwoot(
    tenantId: string,
  ): Promise<OperationsSettingsRecord['chatwoot']> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT id, base_url, account_id, inbox_id, agent_bot_id,
              verification_status, webhook_secret_ref, api_token_ref, metadata
       FROM chatwoot_connections
       WHERE tenant_id = $1 AND is_active
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const metadata = asRecord(row.metadata) ?? {};
    return {
      id: String(row.id),
      base_url: String(row.base_url),
      account_id: Number(row.account_id),
      inbox_id: nullableNumber(row.inbox_id),
      agent_bot_id: nullableNumber(row.agent_bot_id),
      verification_status: String(row.verification_status),
      runtime_mode: readRuntimeMode(metadata.runtime_mode),
      has_webhook_secret: row.webhook_secret_ref !== null,
      has_api_token: row.api_token_ref !== null,
      webhook_secret_ref_hint: secretHint(row.webhook_secret_ref),
      api_token_ref_hint: secretHint(row.api_token_ref),
    };
  }

  private async loadApproval(
    tenantId: string,
    approvalId: string,
  ): Promise<ApprovalSummaryRecord | null> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT approval_id, tenant_id, trace_id, state, suggested_reply,
              evidence_refs, tool_result_refs, risk_reason, expires_at,
              approver_action, approver_id, edited_reply,
              edit_distance::text, action_at, created_at
       FROM approval_requests
       WHERE tenant_id = $1 AND approval_id = $2`,
      [tenantId, approvalId],
    );
    return result.rows[0] ? mapApproval(result.rows[0]) : null;
  }

  private async traceConversation(
    tenantId: string,
    traceId: string,
  ): Promise<string> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT conversation_id FROM agent_traces
       WHERE tenant_id = $1 AND trace_id = $2`,
      [tenantId, traceId],
    );
    return String(required(result.rows[0], 'trace').conversation_id);
  }

  async getPolicyVersions(
    tenantId: string,
  ): Promise<readonly PolicyVersionSummaryRecord[]> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT pv.id, pv.tenant_id, pv.version, pv.name, pv.status,
              pv.content_hash, pv.published_at, pv.created_at,
              COALESCE(pd.doc_count, 0) AS document_count,
              COALESCE(pc.chunk_count, 0) AS chunk_count
       FROM policy_versions pv
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS doc_count
         FROM policy_documents
         WHERE tenant_id = pv.tenant_id AND policy_version_id = pv.id
       ) pd ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS chunk_count
         FROM policy_chunks
         WHERE tenant_id = pv.tenant_id AND policy_version_id = pv.id
       ) pc ON true
       WHERE pv.tenant_id = $1
       ORDER BY pv.version DESC`,
      [tenantId],
    );
    return result.rows.map((row) => mapPolicyVersionRow(row));
  }

  async getPolicyDocuments(
    tenantId: string,
    policyVersionId: string,
  ): Promise<readonly PolicyDocumentSummaryRecord[]> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT pd.id, pd.tenant_id, pd.policy_version_id, pd.source_key,
              pd.title, pd.media_type, pd.content_hash, pd.created_at,
              COALESCE(pc.chunk_count, 0) AS chunk_count
       FROM policy_documents pd
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS chunk_count
         FROM policy_chunks
         WHERE tenant_id = pd.tenant_id
           AND policy_version_id = pd.policy_version_id
           AND document_id = pd.id
       ) pc ON true
       WHERE pd.tenant_id = $1 AND pd.policy_version_id = $2
       ORDER BY pd.source_key`,
      [tenantId, policyVersionId],
    );
    return result.rows.map((row) => mapPolicyDocumentRow(row));
  }

  async createPolicyVersion(
    tenantId: string,
    input: {
      name: string;
      documents: ReadonlyArray<{
        source_key: string;
        title: string;
        content: string;
      }>;
      actorId: string;
    },
  ): Promise<PolicyVersionSummaryRecord> {
    if (input.documents.length === 0) {
      throw new OperationsError('policy_documents_required', 400);
    }
    const nextVersionRow = await this.pool.query<QueryResultRow>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM policy_versions WHERE tenant_id = $1`,
      [tenantId],
    );
    const nextVersion = Number(required(nextVersionRow.rows[0], 'next version').next_version);
    const plan = createPolicyIngestionPlan({
      tenantId,
      policyVersionId: randomUUID(),
      documents: input.documents.map((doc) => ({
        source_key: doc.source_key,
        title: doc.title,
        media_type: 'text/plain',
        content: doc.content,
        metadata: {},
      })),
    });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO policy_versions (
           id, tenant_id, version, name, status, content_hash, metadata
         )
         VALUES ($1, $2, $3, $4, 'draft', $5, '{}'::jsonb)`,
        [plan.policy_version_id, tenantId, nextVersion, input.name, plan.content_hash],
      );
      for (const doc of plan.documents) {
        await client.query(
          `INSERT INTO policy_documents (
             id, tenant_id, policy_version_id, source_key, title,
             media_type, normalized_content, content_hash, metadata
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            doc.id,
            doc.tenant_id,
            doc.policy_version_id,
            doc.source_key,
            doc.title,
            doc.media_type,
            doc.normalized_content,
            doc.content_hash,
            JSON.stringify(doc.metadata),
          ],
        );
      }
      for (const chunk of plan.chunks) {
        await client.query(
          `INSERT INTO policy_chunks (
             id, tenant_id, policy_version_id, document_id, chunk_index,
             char_start, char_end, content, content_hash, token_count, metadata
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}'::jsonb)`,
          [
            chunk.id,
            chunk.tenant_id,
            chunk.policy_version_id,
            chunk.document_id,
            chunk.chunk_index,
            chunk.char_start,
            chunk.char_end,
            chunk.content,
            chunk.content_hash,
            chunk.token_count,
          ],
        );
      }
      await client.query('COMMIT');
      await this.audit(
        tenantId,
        input.actorId,
        'policy_version_created',
        plan.policy_version_id,
        hashJson({ name: input.name, documentCount: input.documents.length }),
      );
      const created = await this.pool.query<QueryResultRow>(
        `SELECT pv.id, pv.tenant_id, pv.version, pv.name, pv.status,
                pv.content_hash, pv.published_at, pv.created_at,
                (SELECT COUNT(*)::int FROM policy_documents
                  WHERE tenant_id = pv.tenant_id AND policy_version_id = pv.id) AS document_count,
                (SELECT COUNT(*)::int FROM policy_chunks
                  WHERE tenant_id = pv.tenant_id AND policy_version_id = pv.id) AS chunk_count
         FROM policy_versions pv
         WHERE pv.tenant_id = $1 AND pv.id = $2`,
        [tenantId, plan.policy_version_id],
      );
      return mapPolicyVersionRow(required(created.rows[0], 'policy version'));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async publishPolicyVersion(
    tenantId: string,
    policyVersionId: string,
    actorId: string,
  ): Promise<PolicyVersionSummaryRecord> {
    const result = await this.pool.query<QueryResultRow>(
      `UPDATE policy_versions
       SET status = 'published', published_at = now(), updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status = 'draft'
       RETURNING id`,
      [tenantId, policyVersionId],
    );
    if (result.rowCount === 0) {
      const existing = await this.pool.query<QueryResultRow>(
        `SELECT status FROM policy_versions
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, policyVersionId],
      );
      if (existing.rows.length === 0) {
        throw new OperationsError('policy_version_not_found', 404);
      }
      throw new OperationsError('policy_version_not_draft', 409);
    }
    await this.audit(
      tenantId,
      actorId,
      'policy_version_published',
      policyVersionId,
      hashJson({ policyVersionId }),
    );
    const reloaded = await this.pool.query<QueryResultRow>(
      `SELECT pv.id, pv.tenant_id, pv.version, pv.name, pv.status,
              pv.content_hash, pv.published_at, pv.created_at,
              (SELECT COUNT(*)::int FROM policy_documents
                WHERE tenant_id = pv.tenant_id AND policy_version_id = pv.id) AS document_count,
              (SELECT COUNT(*)::int FROM policy_chunks
                WHERE tenant_id = pv.tenant_id AND policy_version_id = pv.id) AS chunk_count
       FROM policy_versions pv
       WHERE pv.tenant_id = $1 AND pv.id = $2`,
      [tenantId, policyVersionId],
    );
    return mapPolicyVersionRow(required(reloaded.rows[0], 'policy version'));
  }

  async runRetrievalSmokeTest(
    tenantId: string,
    input: { query: string; limit?: number },
  ): Promise<readonly RetrievalSmokeTestResult[]> {
    const published = await this.pool.query<QueryResultRow>(
      `SELECT id FROM policy_versions
       WHERE tenant_id = $1 AND status = 'published'
       ORDER BY published_at DESC LIMIT 1`,
      [tenantId],
    );
    if (published.rows.length === 0) {
      throw new OperationsError('no_published_policy_version', 409);
    }
    const policyVersionId = String(
      required(published.rows[0], 'published policy version').id,
    );
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const result = await this.pool.query<QueryResultRow>(
      `SELECT chunk_id, document_id, chunk_index, content, content_hash, score
       FROM search_policy_chunks_lexical($1, $2, $3, $4)
       ORDER BY score DESC`,
      [tenantId, policyVersionId, input.query, limit],
    );
    return result.rows.map((row) => ({
      chunk_id: String(row.chunk_id),
      document_id: String(row.document_id),
      chunk_index: Number(row.chunk_index),
      content: String(row.content),
      content_hash: String(row.content_hash),
      score: Number(row.score),
    }));
  }

  private async audit(
    tenantId: string,
    actorId: string,
    action: string,
    resourceId: string,
    inputHash: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_type, actor_id, action, resource_type,
         resource_id, decision, input_hash, metadata
       )
       VALUES ($1, 'operator', $2, $3, 'operations', $4, 'applied', $5, '{}')`,
      [tenantId, actorId, action, resourceId, inputHash],
    );
  }
}

function approvalDeliveryCommand(
  deliveryId: string,
  approval: ApprovalSummaryRecord,
  conversationId: string,
  content: string,
  idempotencyKey: string,
): ChatwootDeliveryCommand {
  return {
    delivery_id: deliveryId,
    tenant_id: approval.tenant_id,
    trace_id: approval.trace_id,
    conversation_id: conversationId,
    message_type: 'public_reply',
    content,
    content_hash: hash(content),
    idempotency_key: `approval:${approval.approval_id}:${idempotencyKey}`,
    deadline_at: new Date(Date.now() + 15_000).toISOString(),
  };
}

async function insertModelConfig(
  client: PoolClient,
  config: ReturnType<typeof createTenantModelConfig>,
): Promise<void> {
  await client.query(
    `INSERT INTO tenant_model_configs (
       id, tenant_id, version, provider, fast_model, strong_model,
       embedding_model, fallback_model, timeout_ms, max_cost_per_ticket,
       daily_budget, budget_currency, encrypted_api_key_ref, is_active,
       config_fingerprint
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14
     )`,
    [
      config.id,
      config.tenant_id,
      config.version,
      config.provider,
      config.fast_model,
      config.strong_model,
      config.embedding_model,
      config.fallback_model,
      config.timeout_ms,
      config.max_cost_per_ticket,
      config.daily_budget,
      config.budget_currency,
      config.encrypted_api_key_ref,
      config.config_fingerprint,
    ],
  );
}

function mapApproval(row: QueryResultRow): ApprovalSummaryRecord {
  return {
    approval_id: String(row.approval_id),
    tenant_id: String(row.tenant_id),
    trace_id: String(row.trace_id),
    state: row.state as ApprovalSummaryRecord['state'],
    suggested_reply: String(row.suggested_reply),
    evidence_refs: stringArray(row.evidence_refs),
    tool_result_refs: stringArray(row.tool_result_refs),
    risk_reason: String(row.risk_reason),
    expires_at: String(row.expires_at),
    approver_action: nullableString(row.approver_action),
    approver_id: nullableString(row.approver_id),
    edited_reply: nullableString(row.edited_reply),
    edit_distance:
      row.edit_distance === null || row.edit_distance === undefined
        ? null
        : Number(row.edit_distance),
    action_at: nullableString(row.action_at),
    created_at: String(row.created_at),
  };
}

function validateSecretReference(value: string | null): void {
  if (value !== null && !/^env:[A-Z][A-Z0-9_]{1,127}$/.test(value)) {
    throw new OperationsError('invalid_secret_reference', 400);
  }
}

function normalizeHttpUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new OperationsError('invalid_chatwoot_url', 400);
  }
}

function secretHint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const prefix = value.split(':', 1)[0] ?? 'secret';
  return `${prefix}:configured`;
}

function readRuntimeMode(value: unknown): RuntimeMode {
  return value === 'assist' || value === 'auto' ? value : 'shadow';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return hash(JSON.stringify(value));
}

function required<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function mapPolicyVersionRow(row: QueryResultRow): PolicyVersionSummaryRecord {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    version: Number(row.version),
    name: String(row.name),
    status: row.status as PolicyVersionSummaryRecord['status'],
    content_hash: String(row.content_hash),
    document_count: Number(row.document_count),
    chunk_count: Number(row.chunk_count),
    published_at: nullableString(row.published_at),
    created_at: String(row.created_at),
  };
}

function mapPolicyDocumentRow(
  row: QueryResultRow,
): PolicyDocumentSummaryRecord {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    policy_version_id: String(row.policy_version_id),
    source_key: String(row.source_key),
    title: String(row.title),
    media_type: String(row.media_type),
    content_hash: String(row.content_hash),
    chunk_count: Number(row.chunk_count),
    created_at: String(row.created_at),
  };
}
