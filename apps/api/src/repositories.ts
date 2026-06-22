import type { Pool, QueryResultRow } from 'pg';
import type {
  AgentOpsStore,
  ApprovalSummaryRecord,
  CanonicalEventCreateInput,
  CanonicalEventCreateResult,
  CanonicalEventRecord,
  Page,
  PageQuery,
  ReleaseCandidateSummaryRecord,
  SafeModelConfigRecord,
  TenantRecord,
  TraceSummaryRecord,
} from './contracts.js';

interface CountRow extends QueryResultRow {
  total: string;
}

interface MigrationRow extends QueryResultRow {
  version: number | null;
}

interface CanonicalEventRow extends QueryResultRow, CanonicalEventRecord {}
interface TenantRow extends QueryResultRow, TenantRecord {}
interface ModelConfigRow
  extends QueryResultRow,
    Omit<SafeModelConfigRecord, 'max_cost_per_ticket' | 'daily_budget'> {
  max_cost_per_ticket: string;
  daily_budget: string;
}
interface TraceRow
  extends QueryResultRow,
    Omit<TraceSummaryRecord, 'estimated_cost'> {
  estimated_cost: string;
}
interface ApprovalRow
  extends QueryResultRow,
    Omit<ApprovalSummaryRecord, 'edit_distance'> {
  edit_distance: string | null;
}
interface ReleaseRow extends QueryResultRow, ReleaseCandidateSummaryRecord {}

export class PostgresAgentOpsStore implements AgentOpsStore {
  constructor(readonly pool: Pool) {}

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getMigrationVersion(): Promise<number> {
    const exists = await this.pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.agentops_schema_migrations') IS NOT NULL AS exists`,
    );
    if (exists.rows[0]?.exists !== true) {
      return 0;
    }
    const result = await this.pool.query<MigrationRow>(
      'SELECT max(version)::integer AS version FROM agentops_schema_migrations',
    );
    return result.rows[0]?.version ?? 0;
  }

  async listTenants(query: PageQuery): Promise<Page<TenantRecord>> {
    const [records, count] = await Promise.all([
      this.pool.query<TenantRow>(
        `SELECT id, slug, display_name, status, metadata, created_at, updated_at
         FROM tenants
         ORDER BY created_at DESC, id
         LIMIT $1 OFFSET $2`,
        [query.limit, query.offset],
      ),
      this.pool.query<CountRow>('SELECT count(*)::text AS total FROM tenants'),
    ]);
    return page(records.rows, query, count.rows[0]);
  }

  async listTenantsByIds(
    tenantIds: readonly string[],
    query: PageQuery,
  ): Promise<Page<TenantRecord>> {
    if (tenantIds.length === 0) {
      return { items: [], total: 0, ...query };
    }
    const [records, count] = await Promise.all([
      this.pool.query<TenantRow>(
        `SELECT id, slug, display_name, status, metadata, created_at, updated_at
         FROM tenants
         WHERE id = ANY($1::uuid[])
         ORDER BY created_at DESC, id
         LIMIT $2 OFFSET $3`,
        [tenantIds, query.limit, query.offset],
      ),
      this.pool.query<CountRow>(
        'SELECT count(*)::text AS total FROM tenants WHERE id = ANY($1::uuid[])',
        [tenantIds],
      ),
    ]);
    return page(records.rows, query, count.rows[0]);
  }

  async getTenant(tenantId: string): Promise<TenantRecord | null> {
    const result = await this.pool.query<TenantRow>(
      `SELECT id, slug, display_name, status, metadata, created_at, updated_at
       FROM tenants WHERE id = $1`,
      [tenantId],
    );
    return result.rows[0] ?? null;
  }

  async getActiveModelConfig(
    tenantId: string,
  ): Promise<SafeModelConfigRecord | null> {
    const result = await this.pool.query<ModelConfigRow>(
      `SELECT
         id, tenant_id, version, provider, fast_model, strong_model,
         embedding_model, fallback_model, timeout_ms,
         max_cost_per_ticket::text, daily_budget::text, budget_currency,
         is_active, config_fingerprint,
         encrypted_api_key_ref IS NOT NULL AS has_encrypted_api_key,
         created_at
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

  async listTraces(
    tenantId: string,
    query: PageQuery,
  ): Promise<Page<TraceSummaryRecord>> {
    const [records, count] = await Promise.all([
      this.pool.query<TraceRow>(
        `SELECT
           trace_id, tenant_id, ticket_id, conversation_id, message_id,
           runtime_mode, execution_state, intent, route, risk_level,
           risk_decision, final_action, latency_ms, estimated_cost::text,
           failure_bucket, created_at, updated_at
         FROM agent_traces
         WHERE tenant_id = $1
         ORDER BY created_at DESC, trace_id
         LIMIT $2 OFFSET $3`,
        [tenantId, query.limit, query.offset],
      ),
      this.pool.query<CountRow>(
        'SELECT count(*)::text AS total FROM agent_traces WHERE tenant_id = $1',
        [tenantId],
      ),
    ]);
    return page(
      records.rows.map((row) => ({
        ...row,
        estimated_cost: Number(row.estimated_cost),
      })),
      query,
      count.rows[0],
    );
  }

  async listApprovals(
    tenantId: string,
    state: ApprovalSummaryRecord['state'] | null,
    query: PageQuery,
  ): Promise<Page<ApprovalSummaryRecord>> {
    const stateClause = state === null ? '' : ' AND state = $4';
    const parameters = state === null
      ? [tenantId, query.limit, query.offset]
      : [tenantId, query.limit, query.offset, state];
    const countParameters = state === null ? [tenantId] : [tenantId, state];
    const countClause = state === null ? '' : ' AND state = $2';
    const [records, count] = await Promise.all([
      this.pool.query<ApprovalRow>(
        `SELECT
           approval_id, tenant_id, trace_id, state, suggested_reply,
           evidence_refs, tool_result_refs, risk_reason, expires_at,
           approver_action, approver_id, edited_reply, edit_distance::text,
           action_at, created_at
         FROM approval_requests
         WHERE tenant_id = $1${stateClause}
         ORDER BY created_at DESC, approval_id
         LIMIT $2 OFFSET $3`,
        parameters,
      ),
      this.pool.query<CountRow>(
        `SELECT count(*)::text AS total
         FROM approval_requests WHERE tenant_id = $1${countClause}`,
        countParameters,
      ),
    ]);
    return page(
      records.rows.map((row) => ({
        ...row,
        edit_distance: row.edit_distance === null ? null : Number(row.edit_distance),
      })),
      query,
      count.rows[0],
    );
  }

  async listReleaseCandidates(
    tenantId: string,
    state: ReleaseCandidateSummaryRecord['state'] | null,
    query: PageQuery,
  ): Promise<Page<ReleaseCandidateSummaryRecord>> {
    const stateClause = state === null ? '' : ' AND state = $4';
    const parameters = state === null
      ? [tenantId, query.limit, query.offset]
      : [tenantId, query.limit, query.offset, state];
    const countParameters = state === null ? [tenantId] : [tenantId, state];
    const countClause = state === null ? '' : ' AND state = $2';
    const [records, count] = await Promise.all([
      this.pool.query<ReleaseRow>(
        `SELECT
           candidate_id, tenant_id, state, agent_version_id, prompt_version_id,
           policy_version_id, model_config_version_id, replay_eval_run_id,
           security_eval_run_id, snapshot_hash, created_at, updated_at
         FROM release_candidates
         WHERE tenant_id = $1${stateClause}
         ORDER BY created_at DESC, candidate_id
         LIMIT $2 OFFSET $3`,
        parameters,
      ),
      this.pool.query<CountRow>(
        `SELECT count(*)::text AS total
         FROM release_candidates WHERE tenant_id = $1${countClause}`,
        countParameters,
      ),
    ]);
    return page(records.rows, query, count.rows[0]);
  }

  async createOrGetCanonicalEvent(
    input: CanonicalEventCreateInput,
  ): Promise<CanonicalEventCreateResult> {
    const event = input.event;
    const result = await this.pool.query<CanonicalEventRow>(
      `INSERT INTO canonical_inbound_events (
         tenant_id, source, conversation_id, message_id, event_type,
         dedupe_key, delivery_keys, payload_hash, is_customer_message,
         is_self_outgoing, decision
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11)
       ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
       RETURNING *`,
      [
        event.tenant_id,
        event.source,
        event.conversation_id,
        event.message_id,
        event.event_type,
        event.dedupe_key,
        [...new Set(input.deliveryKeys)],
        event.payload_hash,
        event.is_customer_message,
        event.is_self_outgoing,
        input.decision,
      ],
    );
    if (result.rows[0]) {
      return { status: 'created', record: result.rows[0] };
    }
    const existing = await this.pool.query<CanonicalEventRow>(
      `UPDATE canonical_inbound_events
       SET delivery_keys = ARRAY(
         SELECT DISTINCT key
         FROM unnest(delivery_keys || $3::text[]) AS key
         ORDER BY key
       )
       WHERE tenant_id = $1 AND dedupe_key = $2
       RETURNING *`,
      [event.tenant_id, event.dedupe_key, [...new Set(input.deliveryKeys)]],
    );
    const record = existing.rows[0];
    if (!record) {
      throw new Error('Canonical event conflict could not be loaded');
    }
    return { status: 'duplicate', record };
  }
}

function page<T>(
  items: T[],
  query: PageQuery,
  count: CountRow | undefined,
): Page<T> {
  return {
    items,
    limit: query.limit,
    offset: query.offset,
    total: Number(count?.total ?? 0),
  };
}
