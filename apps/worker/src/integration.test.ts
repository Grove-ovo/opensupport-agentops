import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createWorkerRuntime } from './runtime.js';
import { loadWorkerConfig } from './config.js';

const RUN = process.env.AGENTOPS_RUN_INTEGRATION === '1';
const integration = RUN ? test : test.skip;

integration(
  'PostgreSQL outbox flows through Redis Streams into durable worker results',
  async (context) => {
    const suffix = randomUUID().slice(0, 8);
    const config = loadWorkerConfig({
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://agentops:agentops@localhost:5432/agentops',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://:agentops@localhost:6379/0',
      AGENTOPS_STREAM_KEY: `agentops:test:${suffix}`,
      AGENTOPS_STREAM_GROUP: `workers-${suffix}`,
      AGENTOPS_DEAD_LETTER_STREAM: `agentops:test:${suffix}:dead`,
      AGENTOPS_WORKER_CONSUMER: `consumer-${suffix}`,
      AGENTOPS_WORKER_READ_BLOCK_MS: '10',
      AGENTOPS_WORKER_RELAY_INTERVAL_MS: '50',
      AGENTOPS_WORKER_VISIBILITY_TIMEOUT_MS: '1000',
      AGENTOPS_WORKER_MAX_ATTEMPTS: '3',
      AGENTOPS_WORKER_BATCH_SIZE: '500',
    });
    const runtime = await createWorkerRuntime(config);
    const tenantId = randomUUID();
    const modelConfigId = randomUUID();
    const traceId = randomUUID();
    const canonicalEventId = randomUUID();
    const executionId = randomUUID();
    context.after(async () => {
      try {
        await runtime.queue.client.del([
          config.streamKey,
          config.deadLetterStream,
        ]);
        await runtime.repository.pool.query(
          `UPDATE tenants SET status = 'archived' WHERE id = $1`,
          [tenantId],
        );
        await runtime.repository.pool.query(
          `UPDATE tenant_model_configs
           SET is_active = false
           WHERE tenant_id = $1`,
          [tenantId],
        );
      } finally {
        await Promise.allSettled([
          runtime.queue.close(),
          runtime.repository.close(),
        ]);
      }
    });

    await runtime.repository.pool.query(
      `INSERT INTO tenants (id, slug, display_name)
       VALUES ($1, $2, 'Worker Integration')`,
      [tenantId, `worker-${suffix}`],
    );
    await runtime.repository.pool.query(
      `INSERT INTO tenant_model_configs (
         id, tenant_id, version, provider, fast_model, strong_model,
         embedding_model, fallback_model, timeout_ms, max_cost_per_ticket,
         daily_budget, budget_currency, encrypted_api_key_ref, is_active,
         config_fingerprint
       )
       VALUES (
         $1, $2, 1, 'openai', 'fast', 'strong', 'embed', 'fallback',
         5000, 1, 10, 'USD', 'enc:v1:test:a:b:c:d:e:f', true,
         repeat('a', 64)
       )`,
      [modelConfigId, tenantId],
    );
    await runtime.repository.pool.query(
      `INSERT INTO agent_traces (
         trace_id, tenant_id, ticket_id, conversation_id, message_id,
         runtime_mode, agent_version_id, prompt_version_id, policy_version_id,
         tool_manifest_version_id, risk_rule_version_id,
         retrieval_config_version_id, model_config_version_id,
         execution_state, pii_categories, masked_input_hash,
         latency_ms, estimated_cost
       )
       VALUES (
         $1, $2, 'ticket-1', 'conversation-1', 'message-1', 'auto',
         'agent-v1', 'prompt-v1', 'policy-v1', 'tools-v1', 'risk-v1',
         'retrieval-v1', $3, 'replied', ARRAY[]::text[], repeat('b', 64),
         420, 0.012
       )`,
      [traceId, tenantId, modelConfigId],
    );
    await runtime.repository.pool.query(
      `INSERT INTO canonical_inbound_events (
         id, tenant_id, source, conversation_id, message_id, event_type,
         dedupe_key, payload_hash, is_customer_message, is_self_outgoing,
         decision, trace_id, processing_status, processing_started_at,
         processed_at
       )
       VALUES (
         $1, $2, 'agent_bot', 'conversation-1', 'message-1',
         'message_created', $3, repeat('c', 64), true, false,
         'pipeline_seeded', $4, 'completed', now(), now()
       )`,
      [canonicalEventId, tenantId, `worker:${suffix}`, traceId],
    );
    await runtime.repository.pool.query(
      `INSERT INTO runtime_execution_audits (
         execution_id, tenant_id, trace_id, canonical_event_id,
         outcome, latency_ms, estimated_cost, input_hash
       )
       VALUES ($1, $2, $3, $4, 'replied', 420, 0.012, repeat('d', 64))`,
      [executionId, tenantId, traceId, canonicalEventId],
    );

    const pending = await runtime.repository.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM async_job_outbox
       WHERE tenant_id = $1 AND published_at IS NULL`,
      [tenantId],
    );
    assert.equal(pending.rows[0]?.count, '2');

    const results = await waitForTenantResults(runtime, tenantId, {
      monitor_count: '1',
      aggregate_count: '1',
      succeeded_count: '2',
    });
    assert.deepEqual(results, {
      monitor_count: '1',
      aggregate_count: '1',
      succeeded_count: '2',
    });

    await runtime.worker.runOnce();
    const duplicates = await runtime.repository.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM monitor_trace_results
       WHERE tenant_id = $1`,
      [tenantId],
    );
    assert.equal(duplicates.rows[0]?.count, '1');

    const recoveryOutboxId = randomUUID();
    const recoveryRecord = {
      outbox_id: recoveryOutboxId,
      tenant_id: tenantId,
      job_type: 'aggregate_dashboard' as const,
      aggregate_type: 'tenant',
      aggregate_id: tenantId,
      dedupe_key: `recovery:${suffix}`,
    };
    await runtime.repository.pool.query(
      `INSERT INTO async_job_outbox (
         outbox_id, tenant_id, job_type, aggregate_type, aggregate_id,
         dedupe_key
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        recoveryRecord.outbox_id,
        recoveryRecord.tenant_id,
        recoveryRecord.job_type,
        recoveryRecord.aggregate_type,
        recoveryRecord.aggregate_id,
        recoveryRecord.dedupe_key,
      ],
    );
    const recoveryStreamId = await runtime.queue.publish(recoveryRecord);
    await runtime.repository.markOutboxPublished(
      recoveryOutboxId,
      recoveryStreamId,
    );
    const abandoned = await runtime.queue.read('crashed-consumer', 1, 10);
    assert.equal(abandoned[0]?.outbox_id, recoveryOutboxId);
    await new Promise((resolve) => setTimeout(resolve, 1_050));
    const recoveryRuntime = await createWorkerRuntime({
      ...config,
      consumerName: `recovery-${suffix}`,
      visibilityTimeoutMs: 1_000,
    });
    try {
      await recoveryRuntime.worker.runOnce();
      const recovered = await runtime.repository.pool.query<{ status: string }>(
        `SELECT status FROM async_job_executions WHERE job_id = $1`,
        [recoveryOutboxId],
      );
      assert.equal(recovered.rows[0]?.status, 'succeeded');
    } finally {
      await Promise.allSettled([
        recoveryRuntime.queue.close(),
        recoveryRuntime.repository.close(),
      ]);
    }

    const poisonId = randomUUID();
    await runtime.repository.pool.query(
      `INSERT INTO async_job_outbox (
         outbox_id, tenant_id, job_type, aggregate_type, aggregate_id,
         dedupe_key
       )
       VALUES ($1, $2, 'monitor_trace', 'invalid', $3, $4)`,
      [poisonId, tenantId, randomUUID(), `poison:${suffix}`],
    );
    const poison = await waitForJobStatus(runtime, poisonId, 'dead_letter');
    assert.equal(poison, 'dead_letter');
    assert.equal(
      Number(await runtime.queue.client.sendCommand([
        'XLEN',
        config.deadLetterStream,
      ])),
      1,
    );
  },
);

async function waitForTenantResults(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  tenantId: string,
  expected: {
    monitor_count: string;
    aggregate_count: string;
    succeeded_count: string;
  },
) {
  let latest = {
    monitor_count: '0',
    aggregate_count: '0',
    succeeded_count: '0',
  };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await runtime.worker.runOnce();
    const results = await runtime.repository.pool.query<typeof latest>(
      `SELECT
         (SELECT count(*) FROM monitor_trace_results
          WHERE tenant_id = $1)::text AS monitor_count,
         (SELECT count(*) FROM operational_aggregates
          WHERE tenant_id = $1
            AND aggregate_name = 'dashboard_overview_24h')::text
            AS aggregate_count,
         (SELECT count(*) FROM async_job_executions
          WHERE tenant_id = $1 AND status = 'succeeded')::text
            AS succeeded_count`,
      [tenantId],
    );
    latest = results.rows[0] ?? latest;
    if (
      latest.monitor_count === expected.monitor_count &&
      latest.aggregate_count === expected.aggregate_count &&
      latest.succeeded_count === expected.succeeded_count
    ) {
      return latest;
    }
  }
  return latest;
}

async function waitForJobStatus(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  jobId: string,
  expected: string,
) {
  let status: string | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await runtime.worker.runOnce();
    const result = await runtime.repository.pool.query<{ status: string }>(
      `SELECT status FROM async_job_executions WHERE job_id = $1`,
      [jobId],
    );
    status = result.rows[0]?.status ?? null;
    if (status === expected) return status;
  }
  return status;
}
