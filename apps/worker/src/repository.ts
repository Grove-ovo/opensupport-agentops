import { createHash } from 'node:crypto';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type {
  JobClaim,
  JobRepository,
  OutboxRecord,
  StreamJob,
} from './contracts.js';

interface ExecutionRow extends QueryResultRow {
  status: 'processing' | 'succeeded' | 'failed' | 'dead_letter';
  locked_at: Date;
}

export class PostgresJobRepository implements JobRepository {
  readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'opensupport-agentops-worker',
    });
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async migrationVersion(): Promise<number> {
    const result = await this.pool.query<{ version: number }>(
      'SELECT coalesce(max(version), 0)::integer AS version FROM agentops_schema_migrations',
    );
    return result.rows[0]?.version ?? 0;
  }

  async listPendingOutbox(limit: number): Promise<readonly OutboxRecord[]> {
    const result = await this.pool.query<OutboxRecord>(
      `SELECT outbox_id, tenant_id, job_type, aggregate_type, aggregate_id,
              dedupe_key
       FROM async_job_outbox
       WHERE published_at IS NULL AND available_at <= now()
       ORDER BY created_at
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async markOutboxPublished(
    outboxId: string,
    streamId: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE async_job_outbox
       SET published_at = coalesce(published_at, now()),
           published_stream_id = coalesce(published_stream_id, $2),
           last_error_code = NULL
       WHERE outbox_id = $1`,
      [outboxId, streamId],
    );
  }

  async markOutboxFailure(
    outboxId: string,
    errorCode: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE async_job_outbox
       SET attempts = attempts + 1,
           last_error_code = $2,
           available_at = now() + make_interval(
             secs => least(60, greatest(1, attempts + 1))
           )
       WHERE outbox_id = $1 AND published_at IS NULL`,
      [outboxId, errorCode],
    );
  }

  async claimJob(
    job: StreamJob,
    consumerName: string,
    visibilityTimeoutMs: number,
  ): Promise<JobClaim> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<ExecutionRow>(
        `SELECT status, locked_at
         FROM async_job_executions
         WHERE job_id = $1
         FOR UPDATE`,
        [job.outbox_id],
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query(
          `INSERT INTO async_job_executions (
             job_id, tenant_id, job_type, dedupe_key, status, attempts,
             consumer_name, locked_at
           )
           VALUES ($1, $2, $3, $4, 'processing', $5, $6, now())`,
          [
            job.outbox_id,
            job.tenant_id,
            job.job_type,
            job.dedupe_key,
            job.attempt,
            consumerName,
          ],
        );
        await client.query('COMMIT');
        return 'claimed';
      }
      if (row.status === 'succeeded' || row.status === 'dead_letter') {
        await client.query('COMMIT');
        return row.status;
      }
      if (
        row.status === 'processing' &&
        Date.now() - row.locked_at.getTime() < visibilityTimeoutMs
      ) {
        await client.query('COMMIT');
        return 'busy';
      }
      await client.query(
        `UPDATE async_job_executions
         SET status = 'processing', attempts = $2, consumer_name = $3,
             last_error_code = NULL, locked_at = now(), completed_at = NULL,
             updated_at = now()
         WHERE job_id = $1`,
        [job.outbox_id, job.attempt, consumerName],
      );
      await client.query('COMMIT');
      return 'claimed';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async executeJob(job: StreamJob): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (job.job_type === 'monitor_trace') {
        await monitorTrace(client, job);
      } else if (job.job_type === 'materialize_eval') {
        await materializeEval(client, job);
      } else {
        await aggregateDashboard(client, job);
      }
      const completed = await client.query(
        `UPDATE async_job_executions
         SET status = 'succeeded', completed_at = now(), updated_at = now()
         WHERE job_id = $1 AND status = 'processing'`,
        [job.outbox_id],
      );
      if (completed.rowCount !== 1) throw new Error('job_lease_lost');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markJobFailure(
    job: StreamJob,
    errorCode: string,
    deadLetter: boolean,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE async_job_executions
       SET status = $2, last_error_code = $3, completed_at = now(),
           updated_at = now()
       WHERE job_id = $1 AND status = 'processing'`,
      [job.outbox_id, deadLetter ? 'dead_letter' : 'failed', errorCode],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function monitorTrace(client: PoolClient, job: StreamJob): Promise<void> {
  if (job.aggregate_type !== 'runtime_execution') {
    throw new Error('invalid_monitor_reference');
  }
  const source = await client.query<QueryResultRow>(
    `SELECT
       audit.execution_id, audit.tenant_id, audit.trace_id, audit.outcome,
       audit.failure_reason, audit.input_hash AS audit_input_hash,
       trace.risk_level, trace.failure_bucket
     FROM runtime_execution_audits AS audit
     JOIN agent_traces AS trace
       ON trace.tenant_id = audit.tenant_id AND trace.trace_id = audit.trace_id
     WHERE audit.execution_id = $1`,
    [job.aggregate_id],
  );
  const row = source.rows[0];
  if (!row) throw new Error('monitor_source_not_found');
  const classification = classifyMonitor(row);
  const inputHash = hashJson({
    execution_id: row.execution_id,
    audit_input_hash: row.audit_input_hash,
    ...classification,
  });
  await client.query(
    `INSERT INTO monitor_trace_results (
       result_id, execution_id, tenant_id, trace_id, outcome, decision,
       bucket, reason_code, severity, input_hash
     )
     VALUES (
       agentops_deterministic_uuid($1), $2, $3, $4, $5, $6, $7, $8, $9, $1
     )
     ON CONFLICT (execution_id) DO NOTHING`,
    [
      inputHash,
      row.execution_id,
      row.tenant_id,
      row.trace_id,
      row.outcome,
      classification.decision,
      classification.bucket,
      classification.reasonCode,
      classification.severity,
    ],
  );
}

function classifyMonitor(row: QueryResultRow): {
  decision: 'pass' | 'fail';
  bucket: string | null;
  reasonCode: string;
  severity: 'P0' | 'P1' | 'P2';
} {
  if (row.risk_level === 'P0') {
    return {
      decision: 'fail',
      bucket: 'security',
      reasonCode: 'p0_runtime_risk',
      severity: 'P0',
    };
  }
  if (row.outcome === 'failed') {
    return {
      decision: 'fail',
      bucket: normalizeBucket(row.failure_bucket) ?? 'infrastructure',
      reasonCode: safeReason(row.failure_reason, 'runtime_failed'),
      severity: 'P1',
    };
  }
  if (normalizeBucket(row.failure_bucket)) {
    return {
      decision: 'fail',
      bucket: normalizeBucket(row.failure_bucket),
      reasonCode: safeReason(row.failure_reason, 'runtime_degraded'),
      severity: 'P2',
    };
  }
  return {
    decision: 'pass',
    bucket: null,
    reasonCode: 'runtime_healthy',
    severity: 'P2',
  };
}

async function materializeEval(
  client: PoolClient,
  job: StreamJob,
): Promise<void> {
  if (job.aggregate_type !== 'release_candidate') {
    throw new Error('invalid_eval_reference');
  }
  const candidate = await client.query<QueryResultRow>(
    `SELECT tenant_id, replay_eval_run_id, security_eval_run_id
     FROM release_candidates
     WHERE candidate_id = $1`,
    [job.aggregate_id],
  );
  const row = candidate.rows[0];
  if (!row) throw new Error('release_candidate_not_found');
  await client.query(
    `WITH failures AS (
       SELECT
         result.tenant_id,
         result.run_id,
         result.result_id,
         result.case_id,
         result.case_kind,
         reason.reason_code,
         result.observation
       FROM eval_case_results AS result
       CROSS JOIN LATERAL unnest(result.reason_codes) AS reason(reason_code)
       WHERE result.tenant_id = $1
         AND result.run_id IN ($3, $4)
         AND result.passed = false
     ),
     normalized AS (
       SELECT *,
         CASE
           WHEN case_kind = 'security'
             OR reason_code IN (
               'safe_action_missing', 'forbidden_action', 'forbidden_tool',
               'p0_not_blocked', 'unsafe_action', 'pii_leak',
               'unauthorized_access', 'unauthorized_access_not_blocked'
             ) THEN 'security'
           WHEN reason_code = 'evidence_missing' THEN 'grounding'
           WHEN reason_code = 'tool_result_missing' THEN 'tool'
           WHEN reason_code = 'latency_exceeded' THEN 'latency'
           WHEN reason_code = 'cost_exceeded' THEN 'cost'
           WHEN reason_code = 'candidate_failed' THEN 'infrastructure'
           ELSE 'quality'
         END AS bucket,
         CASE
           WHEN reason_code = 'latency_exceeded' THEN 'latency_ms'
           WHEN reason_code = 'cost_exceeded' THEN 'estimated_cost'
           ELSE NULL
         END AS metric_name,
         CASE
           WHEN reason_code = 'latency_exceeded'
             AND jsonb_typeof(observation->'latency_ms') = 'number'
             THEN (observation->>'latency_ms')::numeric
           WHEN reason_code = 'cost_exceeded'
             AND jsonb_typeof(observation->'estimated_cost') = 'number'
             THEN (observation->>'estimated_cost')::numeric
           ELSE NULL
         END AS metric_value
       FROM failures
     ),
     identified AS (
       SELECT *,
         encode(digest(
           concat_ws(':', $2::text, run_id::text, result_id::text, reason_code),
           'sha256'
         ), 'hex') AS failure_hash
       FROM normalized
     )
     INSERT INTO failure_cases (
       failure_id, tenant_id, candidate_id, source_type, eval_run_id,
       eval_case_result_id, case_id, bucket, reason_code, metric_name,
       metric_value, input_hash, created_at
     )
     SELECT
       agentops_deterministic_uuid(failure_hash), tenant_id, $2,
       'eval_case', run_id, result_id, case_id, bucket, reason_code,
       metric_name, metric_value, failure_hash, now()
     FROM identified
     ON CONFLICT DO NOTHING`,
    [
      row.tenant_id,
      job.aggregate_id,
      row.replay_eval_run_id,
      row.security_eval_run_id,
    ],
  );
  await client.query(
    `WITH failures AS (
       SELECT
         gate.result_id, gate.candidate_id, gate.tenant_id,
         gate.replay_eval_run_id, gate.security_eval_run_id,
         decision.decision_id, decision.gate_name, decision.reason_code,
         decision.actual_value,
         CASE
           WHEN decision.gate_name LIKE 'security_%'
             OR decision.gate_name = 'replay_unsafe_action_rate'
             THEN 'security'
           WHEN decision.gate_name = 'no_evidence_answer_rate' THEN 'grounding'
           WHEN decision.gate_name = 'retrieval_recall_at_5' THEN 'retrieval'
           WHEN decision.gate_name = 'high_risk_escalation_recall' THEN 'risk'
           WHEN decision.gate_name = 'p95_latency_ms' THEN 'latency'
           WHEN decision.gate_name = 'average_cost_per_ticket' THEN 'cost'
           WHEN decision.gate_name = 'task_success_regression' THEN 'regression'
           ELSE 'quality'
         END AS bucket
       FROM release_gate_results AS gate
       JOIN release_gate_decisions AS decision
         ON decision.result_id = gate.result_id
       WHERE gate.tenant_id = $1
         AND gate.candidate_id = $2
         AND decision.decision = 'fail'
     ),
     identified AS (
       SELECT *,
         encode(digest(
           concat_ws(':', candidate_id::text, decision_id::text, reason_code),
           'sha256'
         ), 'hex') AS failure_hash
       FROM failures
     )
     INSERT INTO failure_cases (
       failure_id, tenant_id, candidate_id, source_type,
       release_gate_result_id, eval_run_id, gate_decision_id, gate_name,
       bucket, reason_code, metric_name, metric_value, input_hash, created_at
     )
     SELECT
       agentops_deterministic_uuid(failure_hash), tenant_id, candidate_id,
       'release_gate', result_id,
       CASE WHEN gate_name LIKE 'security_%'
         THEN security_eval_run_id ELSE replay_eval_run_id END,
       decision_id, gate_name, bucket, reason_code, gate_name,
       CASE WHEN jsonb_typeof(actual_value) = 'number'
         THEN (actual_value #>> '{}')::numeric ELSE NULL END,
       failure_hash, now()
     FROM identified
     ON CONFLICT DO NOTHING`,
    [row.tenant_id, job.aggregate_id],
  );
}

async function aggregateDashboard(
  client: PoolClient,
  job: StreamJob,
): Promise<void> {
  if (job.aggregate_type !== 'tenant' || job.tenant_id !== job.aggregate_id) {
    throw new Error('invalid_dashboard_reference');
  }
  const watermark = await client.query<{ value: Date }>(
    `SELECT coalesce(max(created_at), now()) AS value
     FROM runtime_execution_audits
     WHERE tenant_id = $1`,
    [job.aggregate_id],
  );
  const end = new Date(watermark.rows[0]?.value ?? Date.now());
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() + 1);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const [summary, workload] = await Promise.all([
    client.query<QueryResultRow>(
      `SELECT
         count(DISTINCT conversation_id)::integer AS active_conversations,
         coalesce(
           100.0 * count(*) FILTER (
             WHERE runtime_mode = 'auto' AND execution_state = 'replied'
           ) / nullif(count(*), 0), 0
         )::float8 AS auto_rate,
         (SELECT count(*)::integer FROM approval_requests
          WHERE tenant_id = $1 AND state = 'pending') AS approval_backlog,
         coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
           FILTER (WHERE latency_ms IS NOT NULL), 0)::float8 AS p95_latency_ms,
         coalesce((SELECT sum(estimated_cost)::float8 FROM llm_call_logs
           WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3), 0)
           AS daily_cost,
         count(*) FILTER (WHERE execution_state = 'failed')::integer
           AS failure_count
       FROM agent_traces
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
      [job.aggregate_id, start, end],
    ),
    client.query<QueryResultRow>(
      `SELECT
         date_trunc('hour', created_at) AS bucket,
         count(*)::integer AS traces,
         coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
           FILTER (WHERE latency_ms IS NOT NULL), 0)::float8 AS p95_latency_ms,
         coalesce(sum(estimated_cost), 0)::float8 AS estimated_cost
       FROM agent_traces
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY date_trunc('hour', created_at)
       ORDER BY bucket`,
      [job.aggregate_id, start, end],
    ),
  ]);
  const values = {
    ...(summary.rows[0] ?? {}),
    workload: workload.rows.map((item) => ({
      bucket: new Date(item.bucket).toISOString(),
      traces: Number(item.traces),
      p95_latency_ms: Number(item.p95_latency_ms),
      estimated_cost: Number(item.estimated_cost),
    })),
  };
  await client.query(
    `INSERT INTO operational_aggregates (
       tenant_id, aggregate_name, window_start, window_end, dimensions,
       values, source_watermark
     )
     VALUES ($1, 'dashboard_overview_24h', $2, $3, '{}'::jsonb, $4::jsonb, $5)
     ON CONFLICT (tenant_id, aggregate_name, window_start, dimensions)
     DO UPDATE SET values = EXCLUDED.values,
                   source_watermark = EXCLUDED.source_watermark,
                   updated_at = now()`,
    [job.aggregate_id, start, end, JSON.stringify(values), watermark.rows[0]?.value ?? end],
  );
}

const BUCKETS = new Set([
  'security',
  'grounding',
  'retrieval',
  'tool',
  'risk',
  'latency',
  'cost',
  'regression',
  'quality',
  'infrastructure',
]);

function normalizeBucket(value: unknown): string | null {
  const bucket = typeof value === 'string' ? value : '';
  return BUCKETS.has(bucket) ? bucket : null;
}

function safeReason(value: unknown, fallback: string): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9._:-]{1,128}$/u.test(reason) ? reason : fallback;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
