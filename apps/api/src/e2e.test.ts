import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createTenantModelConfig } from '@opensupport/model-config';
import { buildApp } from './app.js';
import { createPostgresPool } from './database.js';
import { ProductionE2ERepository } from './e2e-repository.js';
import { HttpLLMProviderAdapter } from './provider.js';
import { NodeRedisCoordinator } from './redis.js';
import { PostgresAgentOpsStore } from './repositories.js';
import { EnvironmentSecretResolver } from './secrets.js';
import { PostgresOperationsService } from './operations.js';
import { ProductionTicketService } from './ticket-service.js';

const RUN = process.env.AGENTOPS_RUN_INTEGRATION === '1';
const integration = RUN ? test : test.skip;

integration(
  'Chatwoot ingress executes masked provider calls across Shadow Assist and Auto',
  async (context) => {
    const providerPrompts: string[] = [];
    const chatwootMessages: Array<Record<string, unknown>> = [];
    let providerStatus = 200;
    let chatwootStatus = 200;
    const mock = createServer(async (request, response) => {
      const body = await readBody(request);
      if (request.url === '/v1/chat/completions') {
        const parsed = JSON.parse(body) as {
          messages: Array<{ content: string }>;
        };
        providerPrompts.push(parsed.messages[0]?.content ?? '');
        response.setHeader('Content-Type', 'application/json');
        if (providerStatus !== 200) {
          response.statusCode = providerStatus;
          response.end(JSON.stringify({ error: 'provider unavailable' }));
          return;
        }
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: 'Order ORD-100 is currently shipped.',
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 40, completion_tokens: 12 },
          }),
        );
        return;
      }
      if (request.url?.endsWith('/messages')) {
        chatwootMessages.push(JSON.parse(body) as Record<string, unknown>);
        response.setHeader('Content-Type', 'application/json');
        if (chatwootStatus !== 200) {
          response.statusCode = chatwootStatus;
          response.end(JSON.stringify({ error: 'chatwoot unavailable' }));
          return;
        }
        response.end(JSON.stringify({ id: chatwootMessages.length }));
        return;
      }
      if (request.url?.endsWith('/toggle_status')) {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ success: true }));
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const address = mock.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const pool = createPostgresPool(
      process.env.DATABASE_URL ??
        'postgresql://agentops:agentops@localhost:5432/agentops',
    );
    const store = new PostgresAgentOpsStore(pool);
    const redis = await NodeRedisCoordinator.connect(
      process.env.REDIS_URL ?? 'redis://localhost:6379/0',
    );
    const repository = new ProductionE2ERepository(pool);
    const tenantId = randomUUID();
    const masterKey = Buffer.alloc(32, 7);
    const masterKeyReference = `base64url:${masterKey.toString('base64url')}`;
    const modelConfig = createTenantModelConfig(
      {
        tenantId,
        version: 1,
        provider: 'openai',
        fastModel: 'test-model',
        strongModel: 'test-model',
        embeddingModel: 'test-embedding',
        fallbackModel: 'test-model',
        timeoutMs: 5_000,
        maxCostPerTicket: 1,
        dailyBudget: 10,
        budgetCurrency: 'USD',
        apiKey: 'provider-test-key',
      },
      { masterKey, keyId: 'local-test' },
    );
    await pool.query(
      `INSERT INTO tenants (id, slug, display_name)
       VALUES ($1, $2, 'Phase 6B E2E')`,
      [tenantId, `phase6b-${tenantId.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO chatwoot_connections (
         tenant_id, base_url, account_id, webhook_secret_ref, api_token_ref,
         verification_status, metadata
       )
       VALUES ($1, $2, 1, 'env:TEST_CHATWOOT_WEBHOOK_SECRET',
         'env:TEST_CHATWOOT_API_TOKEN', 'verified', '{"runtime_mode":"shadow"}')`,
      [tenantId, baseUrl],
    );
    await pool.query(
      `INSERT INTO tenant_model_configs (
         id, tenant_id, version, provider, fast_model, strong_model,
         embedding_model, fallback_model, timeout_ms, max_cost_per_ticket,
         daily_budget, budget_currency, encrypted_api_key_ref, is_active,
         config_fingerprint
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14)`,
      [
        modelConfig.id,
        modelConfig.tenant_id,
        modelConfig.version,
        modelConfig.provider,
        modelConfig.fast_model,
        modelConfig.strong_model,
        modelConfig.embedding_model,
        modelConfig.fallback_model,
        modelConfig.timeout_ms,
        modelConfig.max_cost_per_ticket,
        modelConfig.daily_budget,
        modelConfig.budget_currency,
        modelConfig.encrypted_api_key_ref,
        modelConfig.config_fingerprint,
      ],
    );
    await pool.query(
      `INSERT INTO mock_orders (
         tenant_id, contact_id, order_id, order_status, logistics_status,
         tracking_number, refund_eligible, refund_reason
       )
       VALUES ($1, '42', 'ORD-100', 'shipped', 'in_transit', 'TRACK-100', true, NULL)`,
      [tenantId],
    );
    const runtimeConfig = {
      tenant_id: tenantId,
      version: 1,
      allowed_auto_intents: [
        'order_status',
        'logistics_query',
        'invoice_request',
      ],
      max_auto_risk_severity: 'P2',
      max_auto_latency_ms: 5_000,
      max_auto_cost_per_ticket: 1,
      auto_downgrade_mode: 'assist',
    };
    await pool.query(
      `INSERT INTO runtime_mode_configs (
         tenant_id, version, allowed_auto_intents, max_auto_risk_severity,
         max_auto_latency_ms, max_auto_cost_per_ticket, auto_downgrade_mode,
         is_active, config_hash
       )
       VALUES ($1, 1, $2::text[], $3, $4, $5, $6, true, $7)`,
      [
        tenantId,
        runtimeConfig.allowed_auto_intents,
        runtimeConfig.max_auto_risk_severity,
        runtimeConfig.max_auto_latency_ms,
        runtimeConfig.max_auto_cost_per_ticket,
        runtimeConfig.auto_downgrade_mode,
        hash(JSON.stringify(runtimeConfig)),
      ],
    );
    const secrets = new EnvironmentSecretResolver({
      TEST_CHATWOOT_WEBHOOK_SECRET: 'webhook-secret',
      TEST_CHATWOOT_API_TOKEN: 'chatwoot-token',
    });
    const ticketService = new ProductionTicketService(
      store,
      repository,
      redis,
      secrets,
      new HttpLLMProviderAdapter({ openai: baseUrl }),
      {
        masterKey: masterKeyReference,
        pricingByModel: {
          'test-model': {
            inputCostPerMillion: 0.5,
            outputCostPerMillion: 1.5,
          },
        },
        dedupeTtlSeconds: 86_400,
        pipelineDeadlineMs: 10_000,
        approvalTtlMs: 86_400_000,
      },
    );
    const operations = new PostgresOperationsService(
      pool,
      secrets,
      masterKeyReference,
      'local-test',
    );
    const app = buildApp({
      store,
      redis,
      requiredMigration: 15,
      dedupeTtlSeconds: 86_400,
      buildVersion: 'test',
      closeDependencies: false,
      chatwootIngress: ticketService,
      operations,
    });
    context.after(async () => {
      try {
        await app.close();
        await pool.query(`UPDATE tenants SET status = 'archived' WHERE id = $1`, [
          tenantId,
        ]);
        await pool.query(
          `UPDATE chatwoot_connections
           SET is_active = false
           WHERE tenant_id = $1`,
          [tenantId],
        );
        await pool.query(
          `UPDATE tenant_model_configs
           SET is_active = false
           WHERE tenant_id = $1`,
          [tenantId],
        );
        await pool.query(
          `UPDATE runtime_mode_configs
           SET is_active = false
           WHERE tenant_id = $1`,
          [tenantId],
        );
      } finally {
        await Promise.allSettled([store.close(), redis.close()]);
        mock.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          mock.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });

    await pool.query(
      `UPDATE chatwoot_connections
       SET webhook_secret_ref = NULL
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const unsignedConfiguration = await sendEvent(
      app,
      tenantId,
      199,
      'agent-bot',
    );
    assert.equal(unsignedConfiguration.statusCode, 503);
    assert.equal(
      unsignedConfiguration.json().reason_code,
      'webhook_signature_not_configured',
    );
    assert.equal(providerPrompts.length, 0);
    await pool.query(
      `UPDATE chatwoot_connections
       SET webhook_secret_ref = 'env:TEST_CHATWOOT_WEBHOOK_SECRET'
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const shadow = await sendEvent(app, tenantId, 200, 'agent-bot');
    assert.equal(shadow.statusCode, 202);
    assert.equal(shadow.json().outcome, 'private_noted');
    assert.equal(chatwootMessages.length, 1);
    assert.equal(chatwootMessages[0]?.private, true);

    const duplicate = await sendEvent(app, tenantId, 200, 'webhooks');
    assert.equal(duplicate.statusCode, 202);
    assert.equal(duplicate.json().decision, 'duplicate');
    assert.equal(providerPrompts.length, 1);
    const deliveryKeys = await pool.query<{ delivery_keys: string[] }>(
      `SELECT delivery_keys
       FROM canonical_inbound_events
       WHERE tenant_id = $1 AND message_id = '200'`,
      [tenantId],
    );
    assert.deepEqual(deliveryKeys.rows[0]?.delivery_keys, [
      'chatwoot_delivery:' + tenantId + ':delivery-agent-bot-200',
      'chatwoot_delivery:' + tenantId + ':delivery-webhooks-200',
    ]);

    const selfOutgoing = await sendEvent(app, tenantId, 299, 'webhooks', {
      messageType: 'outgoing',
      contentAttributes: { agentops_generated: true },
    });
    assert.equal(selfOutgoing.json().decision, 'audit_only');
    assert.equal(providerPrompts.length, 1);

    await pool.query(
      `UPDATE chatwoot_connections
       SET metadata = '{"runtime_mode":"assist"}'::jsonb
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const assist = await sendEvent(app, tenantId, 201, 'agent-bot');
    assert.equal(assist.json().outcome, 'approval_pending');
    assert.equal(chatwootMessages.length, 1);
    const pendingApproval = await pool.query<{ approval_id: string }>(
      `SELECT approval_id
       FROM approval_requests
       WHERE tenant_id = $1 AND state = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId],
    );
    const approved = await operations.applyApprovalAction({
      tenantId,
      approvalId: pendingApproval.rows[0]?.approval_id ?? '',
      action: 'approve',
      actorId: 'integration-operator',
      editedReply: null,
      idempotencyKey: `approval-${randomUUID()}`,
    });
    assert.equal(approved.state, 'approved');
    assert.equal(chatwootMessages.length, 2);
    assert.equal(chatwootMessages[1]?.private, false);

    await pool.query(
      `UPDATE chatwoot_connections
       SET metadata = '{"runtime_mode":"auto"}'::jsonb
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const auto = await sendEvent(app, tenantId, 202, 'agent-bot');
    assert.equal(auto.json().outcome, 'replied');
    assert.equal(chatwootMessages.length, 3);
    assert.equal(chatwootMessages[2]?.private, false);

    providerStatus = 503;
    const providerFailure = await sendEvent(app, tenantId, 203, 'agent-bot');
    providerStatus = 200;
    assert.equal(providerFailure.json().outcome, 'handed_off');
    assert.equal(chatwootMessages.length, 3);

    chatwootStatus = 503;
    const chatwootFailure = await sendEvent(app, tenantId, 204, 'agent-bot');
    chatwootStatus = 200;
    assert.equal(chatwootFailure.json().outcome, 'failed');
    assert.equal(chatwootFailure.json().reason_code, 'retryable_error');
    assert.equal(chatwootMessages.length, 4);

    assert.equal(providerPrompts.length, 5);
    assert.ok(providerPrompts.every((prompt) => !prompt.includes('alice@example.com')));
    assert.ok(providerPrompts.every((prompt) => prompt.includes('[EMAIL_1]')));
    await pool.query(
      `UPDATE runtime_mode_configs
       SET is_active = false
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const missingRuntimePolicy = await sendEvent(
      app,
      tenantId,
      205,
      'agent-bot',
    );
    assert.equal(missingRuntimePolicy.json().decision, 'pipeline_failed');
    assert.equal(
      missingRuntimePolicy.json().reason_code,
      'runtime_config_unavailable',
    );
    assert.equal(providerPrompts.length, 5);
    const trace = await pool.query<{ trace_id: string }>(
      `SELECT trace_id
       FROM agent_traces
       WHERE tenant_id = $1
       ORDER BY created_at
       LIMIT 1`,
      [tenantId],
    );
    const retryInput = {
      deliveryId: randomUUID(),
      tenantId,
      traceId: trace.rows[0]?.trace_id ?? '',
      conversationId: 'storage-retry',
      messageType: 'private_note' as const,
      idempotencyKey: `storage-retry:${randomUUID()}`,
      inputHash: hash('storage-retry-input'),
      credentialRefHash: hash('env:TEST_CHATWOOT_API_TOKEN'),
      requestHash: hash('storage-retry-request-1'),
    };
    const initialClaim = await repository.claimDelivery(retryInput);
    assert.equal(initialClaim.status, 'claimed');
    await repository.completeDelivery(
      retryInput.deliveryId,
      'failed',
      'retryable_error',
      null,
      null,
    );
    const retryClaim = await repository.claimDelivery({
      ...retryInput,
      deliveryId: randomUUID(),
      requestHash: hash('storage-retry-request-2'),
    });
    assert.equal(retryClaim.status, 'claimed');
    const retryRow = await pool.query<{ status: string; attempt_count: number }>(
      `SELECT status, attempt_count
       FROM chatwoot_delivery_attempts
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenantId, retryInput.idempotencyKey],
    );
    assert.deepEqual(retryRow.rows[0], { status: 'pending', attempt_count: 2 });

    const counts = await pool.query<{
      traces: string;
      calls: string;
      approvals: string;
      deliveries: string;
      events: string;
      audits: string;
    }>(
      `SELECT
         (SELECT count(*) FROM agent_traces WHERE tenant_id = $1)::text AS traces,
         (SELECT count(*) FROM llm_call_logs WHERE tenant_id = $1)::text AS calls,
         (SELECT count(*) FROM approval_requests WHERE tenant_id = $1)::text AS approvals,
         (SELECT count(*) FROM chatwoot_delivery_attempts WHERE tenant_id = $1)::text AS deliveries,
         (SELECT count(*) FROM canonical_inbound_events WHERE tenant_id = $1)::text AS events,
         (SELECT count(*) FROM runtime_execution_audits WHERE tenant_id = $1)::text AS audits`,
      [tenantId],
    );
    assert.deepEqual(counts.rows[0], {
      traces: '5',
      calls: '5',
      approvals: '1',
      deliveries: '5',
      events: '7',
      audits: '5',
    });
    const failedAudit = await pool.query<{
      delivery_linked: boolean;
      latency_valid: boolean;
      cost_valid: boolean;
    }>(
      `SELECT
         delivery_id IS NOT NULL AS delivery_linked,
         latency_ms >= 0 AS latency_valid,
         estimated_cost >= 0 AS cost_valid
       FROM runtime_execution_audits
       WHERE tenant_id = $1 AND outcome = 'failed'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId],
    );
    assert.deepEqual(failedAudit.rows[0], {
      delivery_linked: true,
      latency_valid: true,
      cost_valid: true,
    });
  },
);

async function sendEvent(
  app: ReturnType<typeof buildApp>,
  tenantId: string,
  messageId: number,
  route: 'agent-bot' | 'webhooks',
  options: {
    messageType?: 'incoming' | 'outgoing';
    contentAttributes?: Record<string, unknown>;
  } = {},
) {
  const body = JSON.stringify({
    event: 'message_created',
    message: {
      id: messageId,
      content:
        'What is the order status for order id ORD-100? Please email alice@example.com with the update.',
      message_type: options.messageType ?? 'incoming',
      private: false,
      content_attributes: options.contentAttributes,
      conversation: { id: 100 },
      sender: { id: 42 },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', 'webhook-secret')
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return app.inject({
    method: 'POST',
    url: `/api/v1/chatwoot/${route}/${tenantId}`,
    headers: {
      'content-type': 'application/json',
      'x-chatwoot-timestamp': timestamp,
      'x-chatwoot-signature': `sha256=${signature}`,
      'x-chatwoot-delivery': `delivery-${route}-${messageId}`,
    },
    payload: body,
  });
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function readBody(
  request: import('node:http').IncomingMessage,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
