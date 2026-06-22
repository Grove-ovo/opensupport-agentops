import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import pg from 'pg';
import { createTenantModelConfig, parseMasterKey } from '@opensupport/model-config';

const { Client } = pg;
const publicUrl = process.env.AGENTOPS_PUBLIC_URL ?? 'http://127.0.0.1:8088';
const databaseUrl =
  process.env.SMOKE_DATABASE_URL ??
  'postgresql://agentops:replace-with-long-random-password@127.0.0.1:55432/agentops';
const masterKeyFile =
  process.env.SMOKE_MASTER_KEY_FILE ?? 'secrets/agentops_master_key';
const webhookSecret =
  process.env.SMOKE_CHATWOOT_WEBHOOK_SECRET ?? 'smoke-webhook-secret';
const mockPort = Number(process.env.SMOKE_MOCK_PORT ?? 18090);
const tenantId = randomUUID();
const modelConfigId = randomUUID();
const slug = `smoke-${tenantId.slice(0, 8)}`;
const mockMessages = [];

const mock = createServer(async (request, response) => {
  const body = await readBody(request);
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/v1/chat/completions') {
    response.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        reply: 'Order SMOKE-100 is currently shipped.',
      }) } }],
      usage: { prompt_tokens: 24, completion_tokens: 9 },
    }));
    return;
  }
  if (request.url?.endsWith('/messages')) {
    mockMessages.push(JSON.parse(body));
    response.end(JSON.stringify({ id: mockMessages.length }));
    return;
  }
  if (request.url?.endsWith('/toggle_status')) {
    response.end(JSON.stringify({ success: true }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not_found' }));
});

await new Promise((resolve) => mock.listen(mockPort, '0.0.0.0', resolve));
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await expectOk(`${publicUrl}/health/ready`);
  await expectOk(`${publicUrl}/worker/health/ready`);
  const masterKeyReference = (await readFile(masterKeyFile, 'utf8')).trim();
  const masterKey = parseMasterKey(masterKeyReference);
  const modelConfig = createTenantModelConfig(
    {
      tenantId,
      version: 1,
      provider: 'openai',
      fastModel: 'smoke-model',
      strongModel: 'smoke-model',
      embeddingModel: 'smoke-embedding',
      fallbackModel: 'smoke-model',
      timeoutMs: 5_000,
      maxCostPerTicket: 1,
      dailyBudget: 10,
      budgetCurrency: 'USD',
      apiKey: 'smoke-provider-key',
    },
    { masterKey, keyId: 'production-v1' },
  );
  masterKey.fill(0);
  await client.query(
    `INSERT INTO tenants (id, slug, display_name)
     VALUES ($1, $2, 'Production Smoke')`,
    [tenantId, slug],
  );
  await client.query(
    `INSERT INTO chatwoot_connections (
       tenant_id, base_url, account_id, webhook_secret_ref, api_token_ref,
       verification_status, metadata
     )
     VALUES (
       $1, $2, 1, 'env:SMOKE_CHATWOOT_WEBHOOK_SECRET',
       'env:SMOKE_CHATWOOT_API_TOKEN', 'verified',
       '{"runtime_mode":"auto"}'
     )`,
    [tenantId, `http://host.docker.internal:${mockPort}`],
  );
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
      modelConfigId,
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
  const runtimeConfig = {
    tenant_id: tenantId,
    version: 1,
    allowed_auto_intents: ['order_status', 'logistics_query'],
    max_auto_risk_severity: 'P2',
    max_auto_latency_ms: 5_000,
    max_auto_cost_per_ticket: 1,
    auto_downgrade_mode: 'assist',
  };
  await client.query(
    `INSERT INTO runtime_mode_configs (
       tenant_id, version, allowed_auto_intents, max_auto_risk_severity,
       max_auto_latency_ms, max_auto_cost_per_ticket, auto_downgrade_mode,
       is_active, config_hash
     )
     VALUES ($1, 1, $2::text[], 'P2', 5000, 1, 'assist', true, $3)`,
    [
      tenantId,
      runtimeConfig.allowed_auto_intents,
      hash(JSON.stringify(runtimeConfig)),
    ],
  );
  await client.query(
    `INSERT INTO mock_orders (
       tenant_id, contact_id, order_id, order_status, logistics_status,
       tracking_number, refund_eligible
     )
     VALUES (
       $1, '42', 'SMOKE-100', 'shipped', 'in_transit', 'TRACK-SMOKE', true
     )`,
    [tenantId],
  );

  const body = JSON.stringify({
    event: 'message_created',
    message: {
      id: 9001,
      content: 'What is the status of order id SMOKE-100?',
      message_type: 'incoming',
      private: false,
      conversation: { id: 8001 },
      sender: { id: 42 },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const ingress = await fetch(
    `${publicUrl}/api/v1/chatwoot/agent-bot/${tenantId}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-timestamp': timestamp,
        'x-chatwoot-signature': `sha256=${signature}`,
        'x-chatwoot-delivery': `smoke-${randomUUID()}`,
      },
      body,
    },
  );
  if (!ingress.ok) throw new Error(`ingress_failed:${ingress.status}`);
  const result = await ingress.json();
  if (result.outcome !== 'replied') {
    throw new Error(`unexpected_outcome:${String(result.outcome)}`);
  }

  const traces = await poll(async () => {
    const response = await expectOk(
      `${publicUrl}/api/v1/tenants/${tenantId}/traces?limit=10&offset=0`,
    );
    const page = await response.json();
    return page.items?.length ? page : null;
  });
  const overview = await poll(async () => {
    const response = await expectOk(
      `${publicUrl}/api/v1/tenants/${tenantId}/overview`,
    );
    const value = await response.json();
    return value.active_conversations > 0 ? value : null;
  });
  const dashboard = await (await expectOk(publicUrl)).text();
  if (!dashboard.includes('OpenSupport AgentOps')) {
    throw new Error('dashboard_asset_missing');
  }
  if (mockMessages.length !== 1 || mockMessages[0]?.private !== false) {
    throw new Error('chatwoot_delivery_missing');
  }
  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    tenant_id: tenantId,
    trace_id: traces.items[0].trace_id,
    active_conversations: overview.active_conversations,
    chatwoot_messages: mockMessages.length,
  })}\n`);
} finally {
  await client.query(
    `UPDATE tenants SET status = 'archived' WHERE id = $1`,
    [tenantId],
  ).catch(() => {});
  await client.query(
    `UPDATE tenant_model_configs SET is_active = false WHERE tenant_id = $1`,
    [tenantId],
  ).catch(() => {});
  await client.query(
    `UPDATE runtime_mode_configs SET is_active = false WHERE tenant_id = $1`,
    [tenantId],
  ).catch(() => {});
  await client.query(
    `UPDATE chatwoot_connections SET is_active = false WHERE tenant_id = $1`,
    [tenantId],
  ).catch(() => {});
  await client.end();
  mock.closeAllConnections();
  await new Promise((resolve, reject) =>
    mock.close((error) => error ? reject(error) : resolve()),
  );
}

async function expectOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`http_${response.status}:${url}`);
  return response;
}

async function poll(operation, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await operation();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('poll_timeout');
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
