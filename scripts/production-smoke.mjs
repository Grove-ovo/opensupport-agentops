import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createTenantModelConfig, parseMasterKey } from '@opensupport/model-config';
import { createProductionMockServer } from './production-mock.mjs';

await loadSmokeEnv();

const { Client } = pg;
const publicUrl = process.env.AGENTOPS_PUBLIC_URL ?? 'http://127.0.0.1:8088';
const databaseUrl =
  process.env.SMOKE_DATABASE_URL ??
  smokeDatabaseUrlFromComposeEnv() ??
  'postgresql://agentops:replace-with-long-random-password@127.0.0.1:55432/agentops';
const masterKeyFile =
  process.env.SMOKE_MASTER_KEY_FILE ?? 'secrets/agentops_master_key';
const webhookSecret =
  process.env.SMOKE_CHATWOOT_WEBHOOK_SECRET ?? 'smoke-webhook-secret';
const mockPort = Number(process.env.SMOKE_MOCK_PORT ?? 18090);
const chatwootBaseUrl =
  process.env.SMOKE_CHATWOOT_BASE_URL ??
  `http://host.docker.internal:${mockPort}`;
const keepDemoData = process.env.SMOKE_KEEP_DEMO_DATA === '1';
const tenantId = randomUUID();
const modelConfigId = randomUUID();
const slug = `smoke-${tenantId.slice(0, 8)}`;
const mockBaseUrl = `http://127.0.0.1:${mockPort}`;
const localMock = await ensureMock(mockBaseUrl, mockPort);
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await expectOk(`${mockBaseUrl}/__smoke/reset`, { method: 'POST' });
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
    [tenantId, chatwootBaseUrl],
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
     VALUES
       ($1, '42', 'SMOKE-100', 'shipped', 'in_transit', 'TRACK-SMOKE', true),
       ($1, 'dry-run', 'DRYRUN-100', 'delivered', 'delivered', 'TRACK-DRYRUN', true)`,
    [tenantId],
  );

  const session = await authenticateOperator(publicUrl);
  const authHeaders = {
    cookie: session.cookie,
    'x-csrf-token': session.csrfToken,
  };
  const policy = await createDemoPolicy(publicUrl, tenantId, authHeaders);

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
      { headers: authHeaders },
    );
    const page = await response.json();
    return page.items?.length ? page : null;
  });
  const overview = await poll(async () => {
    const response = await expectOk(
      `${publicUrl}/api/v1/tenants/${tenantId}/overview`,
      { headers: authHeaders },
    );
    const value = await response.json();
    return value.active_conversations > 0 ? value : null;
  });
  const dashboard = await (await expectOk(publicUrl)).text();
  if (!dashboard.includes('OpenSupport AgentOps')) {
    throw new Error('dashboard_asset_missing');
  }
  const mockState = await (
    await expectOk(`${mockBaseUrl}/__smoke/state`)
  ).json();
  if (
    mockState.messages.length !== 1 ||
    mockState.messages[0]?.private !== false
  ) {
    throw new Error('chatwoot_delivery_missing');
  }
  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    tenant_id: tenantId,
    trace_id: traces.items[0].trace_id,
    active_conversations: overview.active_conversations,
    chatwoot_messages: mockState.messages.length,
    operator_subject: session.subject,
    policy_version: policy.version,
    demo_data_retained: keepDemoData,
  })}\n`);
} finally {
  if (!keepDemoData) {
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
  }
  await client.end();
  if (localMock !== null) {
    localMock.closeAllConnections();
    await new Promise((resolve, reject) =>
      localMock.close((error) => error ? reject(error) : resolve()),
    );
  }
}

async function createDemoPolicy(baseUrl, tenantId, authHeaders) {
  const created = await expectOk(
    `${baseUrl}/api/v1/tenants/${tenantId}/policy-versions`,
    {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Demo support policy',
        documents: [
          {
            source_key: 'demo-support-policy.md',
            title: 'Demo support policy',
            content: [
              'Orders marked shipped are already in carrier handoff.',
              'Customers may request refund eligibility checks after delivery delay.',
              'Refund dry-runs must not create external side effects.',
              'Escalate to a human when a customer asks for supervisor review.',
            ].join('\n'),
          },
        ],
      }),
    },
  );
  const draft = await created.json();
  const published = await expectOk(
    `${baseUrl}/api/v1/tenants/${tenantId}/policy-versions/${draft.id}/publish`,
    {
      method: 'PUT',
      headers: authHeaders,
    },
  );
  return published.json();
}

async function expectOk(url, init) {
  const response = await fetch(url, init);
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

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function smokeDatabaseUrlFromComposeEnv() {
  const user = process.env.AGENTOPS_POSTGRES_USER;
  const password = process.env.AGENTOPS_POSTGRES_PASSWORD;
  const database = process.env.AGENTOPS_POSTGRES_DB;
  if (!user || !password || !database) return null;
  const port = process.env.AGENTOPS_POSTGRES_PORT ?? '55432';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${encodeURIComponent(database)}`;
}

async function loadSmokeEnv() {
  const envFile = process.env.SMOKE_ENV_FILE ?? '.env.ci.smoke';
  if (envFile.length === 0) return;
  let content;
  try {
    content = await readFile(envFile, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!Object.hasOwn(process.env, key)) {
      process.env[key] = value;
    }
  }
}

async function ensureMock(baseUrl, port) {
  try {
    await expectOk(`${baseUrl}/__smoke/health`);
    return null;
  } catch {
    const server = createProductionMockServer();
    await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
    return server;
  }
}

async function authenticateOperator(baseUrl) {
  const cookies = new Map();
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    redirect: 'manual',
  });
  if (login.status !== 302) {
    throw new Error(`oidc_login_failed:${login.status}`);
  }
  updateCookies(cookies, login.headers.getSetCookie());
  const authorization = new URL(login.headers.get('location'));
  const state = authorization.searchParams.get('state');
  if (!state) throw new Error('oidc_state_missing');
  const callback = await fetch(
    `${baseUrl}/api/v1/auth/callback?code=smoke-code&state=${encodeURIComponent(state)}`,
    {
      redirect: 'manual',
      headers: { cookie: cookieHeader(cookies) },
    },
  );
  if (callback.status !== 302) {
    throw new Error(`oidc_callback_failed:${callback.status}`);
  }
  updateCookies(cookies, callback.headers.getSetCookie());
  const identity = await expectOk(`${baseUrl}/api/v1/auth/session`, {
    headers: { cookie: cookieHeader(cookies) },
  });
  const body = await identity.json();
  return {
    cookie: cookieHeader(cookies),
    csrfToken: body.csrf_token,
    subject: body.principal.subject,
  };
}

function updateCookies(jar, setCookies) {
  for (const value of setCookies) {
    const pair = value.split(';', 1)[0];
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const cookieValue = pair.slice(separator + 1);
    if (cookieValue.length === 0) jar.delete(name);
    else jar.set(name, cookieValue);
  }
}

function cookieHeader(jar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}
