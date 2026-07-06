#!/usr/bin/env node
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import {
  createTenantModelConfig,
  parseMasterKey,
} from '@opensupport/model-config';
import { createProductionMockServer } from './production-mock.mjs';
import {
  buildProductionLoadReport,
  loadCheck,
  normalizeScenario,
  normalizeThresholds,
  rounded,
  writeProductionLoadReports,
} from './production-load-lib.mjs';

await main().catch((error) => {
  process.stderr.write(`production_load_failed:${stableErrorCode(error)}\n`);
  process.exitCode = 1;
});

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  await loadSmokeEnv(cli.envFile);

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
  const mockPort = numberOption('SMOKE_MOCK_PORT', 18_090);
  const chatwootBaseUrl =
    process.env.SMOKE_CHATWOOT_BASE_URL ??
    `http://host.docker.internal:${mockPort}`;
  const mockBaseUrl = `http://127.0.0.1:${mockPort}`;
  const keepDemoData =
    cli.keepDemoData ?? process.env.PRODUCTION_LOAD_KEEP_DEMO_DATA === '1';
  const jsonPath = cli.jsonPath ?? 'tmp/production-load.json';
  const markdownPath = cli.markdownPath ?? 'tmp/production-load.md';
  const scenario = normalizeScenario({
    warmup_iterations: cli.warmupIterations ??
      numberOption('PRODUCTION_LOAD_WARMUP', 2),
    measured_iterations: cli.measuredIterations ??
      numberOption('PRODUCTION_LOAD_ITERATIONS', 20),
    concurrency: cli.concurrency ??
      numberOption('PRODUCTION_LOAD_CONCURRENCY', 4),
    request_timeout_ms: cli.timeoutMs ??
      numberOption('PRODUCTION_LOAD_TIMEOUT_MS', 10_000),
    iteration_delay_ms: cli.iterationDelayMs ??
      numberOption('PRODUCTION_LOAD_ITERATION_DELAY_MS', 0),
    include_operator_read_probe: cli.includeOperatorReadProbe,
  });
  const thresholds = normalizeThresholds({
    max_error_count: cli.maxErrorCount ??
      numberOption('PRODUCTION_LOAD_MAX_ERROR_COUNT', 0),
    max_timeout_count: cli.maxTimeoutCount ??
      numberOption('PRODUCTION_LOAD_MAX_TIMEOUT_COUNT', 0),
    max_error_rate: cli.maxErrorRate ??
      numberOption('PRODUCTION_LOAD_MAX_ERROR_RATE', 0),
    max_p95_latency_ms: cli.maxP95Ms ??
      numberOption('PRODUCTION_LOAD_MAX_P95_MS', 5_000),
    min_throughput_per_second: cli.minThroughput ??
      numberOption('PRODUCTION_LOAD_MIN_THROUGHPUT', 0.5),
  });

  const tenantId = randomUUID();
  const modelConfigId = randomUUID();
  const slug = `load-${tenantId.slice(0, 8)}`;
  const client = new Client({ connectionString: databaseUrl });
  let localMock = null;
  const setupChecks = [];

  try {
    localMock = await ensureMock(mockBaseUrl, mockPort);
    await expectOk(`${mockBaseUrl}/__smoke/reset`, { method: 'POST' });
    setupChecks.push(loadCheck('mock_reset', 'ready', 'mock_state_reset'));
    await expectOk(`${publicUrl}/health/ready`);
    setupChecks.push(loadCheck('api_readiness', 'ready', 'api_ready'));
    await expectOk(`${publicUrl}/worker/health/ready`);
    setupChecks.push(loadCheck('worker_readiness', 'ready', 'worker_ready'));

    await client.connect();
    await seedTenantFixture(client, {
      tenantId,
      modelConfigId,
      slug,
      masterKeyFile,
      chatwootBaseUrl,
    });
    setupChecks.push(loadCheck('tenant_seed', 'ready', 'tenant_fixture_seeded'));

    const session = await authenticateOperator(publicUrl);
    const authHeaders = {
      cookie: session.cookie,
      'x-csrf-token': session.csrfToken,
    };
    setupChecks.push(loadCheck('operator_auth', 'ready', 'operator_authenticated'));

    const policy = await createDemoPolicy(publicUrl, tenantId, authHeaders);
    setupChecks.push(
      loadCheck('policy_publish', 'ready', 'policy_version_published', {
        version: policy.version,
      }),
    );

    const warmup = await runLoadPhase({
      phase: 'warmup',
      iterations: scenario.warmup_iterations,
      concurrency: scenario.concurrency,
      publicUrl,
      tenantId,
      webhookSecret,
      authHeaders,
      scenario,
    });
    const measured = await runLoadPhase({
      phase: 'measured',
      iterations: scenario.measured_iterations,
      concurrency: scenario.concurrency,
      publicUrl,
      tenantId,
      webhookSecret,
      authHeaders,
      scenario,
    });
    const mockState = await (
      await expectOk(`${mockBaseUrl}/__smoke/state`)
    ).json();
    const expectedMessages =
      warmup.results.filter((result) => result.status === 'succeeded').length +
      measured.results.filter((result) => result.status === 'succeeded').length;
    const report = buildProductionLoadReport({
      public_url: publicUrl,
      tenant_id: tenantId,
      scenario,
      thresholds,
      setup_checks: setupChecks,
      warmup_results: warmup.results,
      measured_results: measured.results,
      duration_ms: measured.durationMs,
      max_observed_concurrency: measured.maxObservedConcurrency,
      delivery: {
        expected_messages: expectedMessages,
        observed_messages: mockState.messages.length,
      },
    });
    const paths = writeProductionLoadReports(report, {
      jsonPath,
      markdownPath,
    });
    process.stdout.write(
      `${JSON.stringify({
        status: report.status,
        report_path: paths.jsonPath,
        markdown_path: paths.markdownPath,
        metrics: report.metrics,
        blocked: report.summary.blocked,
      })}\n`,
    );
    if (report.status === 'blocked') {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`production_load_failed:${stableErrorCode(error)}\n`);
    process.exitCode = 1;
  } finally {
    if (!keepDemoData) {
      await cleanupTenantFixture(client, tenantId);
    }
    await client.end().catch(() => {});
    if (localMock !== null) {
      localMock.closeAllConnections();
      await new Promise((resolve, reject) =>
        localMock.close((error) => (error ? reject(error) : resolve())),
      ).catch(() => {});
    }
  }
}

async function runLoadPhase(options) {
  if (options.iterations === 0) {
    return { results: [], durationMs: 0, maxObservedConcurrency: 0 };
  }
  const results = new Array(options.iterations);
  let nextIndex = 0;
  let active = 0;
  let maximumActive = 0;
  const startedAt = performance.now();
  const workerCount = Math.min(options.concurrency, options.iterations);
  const worker = async () => {
    while (nextIndex < options.iterations) {
      const iterationIndex = nextIndex;
      nextIndex += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        results[iterationIndex] = await executeLoadIteration({
          ...options,
          iterationIndex,
        });
      } finally {
        active -= 1;
      }
      if (
        options.scenario.iteration_delay_ms > 0 &&
        nextIndex < options.iterations
      ) {
        await delay(options.scenario.iteration_delay_ms);
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return {
    results,
    durationMs: Math.max(1, performance.now() - startedAt),
    maxObservedConcurrency: maximumActive,
  };
}

async function executeLoadIteration(options) {
  const startedAt = performance.now();
  const signal = AbortSignal.timeout(options.scenario.request_timeout_ms);
  try {
    await sendSignedWebhook({ ...options, signal });
    if (options.scenario.include_operator_read_probe) {
      await expectOk(
        `${options.publicUrl}/api/v1/tenants/${options.tenantId}/overview`,
        {
          headers: options.authHeaders,
          signal,
        },
      );
    }
    return iterationResult(
      options.iterationIndex,
      'succeeded',
      startedAt,
      null,
    );
  } catch (error) {
    return iterationResult(
      options.iterationIndex,
      timeoutError(error, signal) ? 'timeout' : 'error',
      startedAt,
      timeoutError(error, signal) ? 'timeout' : stableErrorCode(error),
    );
  }
}

async function sendSignedWebhook(options) {
  const offset = options.phase === 'warmup' ? 100_000 : 200_000;
  const body = JSON.stringify({
    event: 'message_created',
    message: {
      id: offset + options.iterationIndex,
      content: 'What is the status of order id SMOKE-100?',
      message_type: 'incoming',
      private: false,
      conversation: { id: offset + 8_000 + options.iterationIndex },
      sender: { id: 42 },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', options.webhookSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const response = await fetch(
    `${options.publicUrl}/api/v1/chatwoot/agent-bot/${options.tenantId}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-timestamp': timestamp,
        'x-chatwoot-signature': `sha256=${signature}`,
        'x-chatwoot-delivery': `load-${options.phase}-${randomUUID()}`,
      },
      body,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`http_${response.status}`);
  }
  const result = await response.json();
  if (result.outcome !== 'replied') {
    throw new Error('unexpected_ingress_outcome');
  }
}

async function seedTenantFixture(client, options) {
  const masterKeyReference = (await readFile(options.masterKeyFile, 'utf8'))
    .trim();
  const masterKey = parseMasterKey(masterKeyReference);
  const modelConfig = createTenantModelConfig(
    {
      tenantId: options.tenantId,
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
     VALUES ($1, $2, 'Production Load')`,
    [options.tenantId, options.slug],
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
    [options.tenantId, options.chatwootBaseUrl],
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
      options.modelConfigId,
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
    tenant_id: options.tenantId,
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
      options.tenantId,
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
    [options.tenantId],
  );
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
        name: 'Load support policy',
        documents: [
          {
            source_key: 'load-support-policy.md',
            title: 'Load support policy',
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

async function cleanupTenantFixture(client, tenantId) {
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

async function expectOk(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`http_${response.status}`);
  return response;
}

async function loadSmokeEnv(envFile = process.env.SMOKE_ENV_FILE ?? '.env.ci.smoke') {
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
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => {
        server.off('error', reject);
        resolve();
      });
    });
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
  };
}

function parseArgs(args) {
  const parsed = {
    includeOperatorReadProbe: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--env-file':
        parsed.envFile = requiredValue(args, ++index, arg);
        break;
      case '--json':
        parsed.jsonPath = requiredValue(args, ++index, arg);
        break;
      case '--markdown':
        parsed.markdownPath = requiredValue(args, ++index, arg);
        break;
      case '--warmup':
        parsed.warmupIterations = parseCliNumber(args, ++index, arg);
        break;
      case '--iterations':
        parsed.measuredIterations = parseCliNumber(args, ++index, arg);
        break;
      case '--concurrency':
        parsed.concurrency = parseCliNumber(args, ++index, arg);
        break;
      case '--timeout-ms':
        parsed.timeoutMs = parseCliNumber(args, ++index, arg);
        break;
      case '--iteration-delay-ms':
        parsed.iterationDelayMs = parseCliNumber(args, ++index, arg);
        break;
      case '--max-errors':
        parsed.maxErrorCount = parseCliNumber(args, ++index, arg);
        break;
      case '--max-timeouts':
        parsed.maxTimeoutCount = parseCliNumber(args, ++index, arg);
        break;
      case '--max-error-rate':
        parsed.maxErrorRate = parseCliNumber(args, ++index, arg);
        break;
      case '--max-p95-ms':
        parsed.maxP95Ms = parseCliNumber(args, ++index, arg);
        break;
      case '--min-throughput':
        parsed.minThroughput = parseCliNumber(args, ++index, arg);
        break;
      case '--keep-demo-data':
        parsed.keepDemoData = true;
        break;
      case '--no-read-probe':
        parsed.includeOperatorReadProbe = false;
        break;
      default:
        throw new Error(`unknown_argument:${arg}`);
    }
  }
  return parsed;
}

function parseCliNumber(args, index, flag) {
  return Number(requiredValue(args, index, flag));
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`missing_value:${flag}`);
  }
  return value;
}

function numberOption(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) return fallback;
  return Number(value);
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

function smokeDatabaseUrlFromComposeEnv() {
  const user = process.env.AGENTOPS_POSTGRES_USER;
  const password = process.env.AGENTOPS_POSTGRES_PASSWORD;
  const database = process.env.AGENTOPS_POSTGRES_DB;
  if (!user || !password || !database) return null;
  const port = process.env.AGENTOPS_POSTGRES_PORT ?? '55432';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${encodeURIComponent(database)}`;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function iterationResult(iterationIndex, status, startedAt, errorCode) {
  return {
    iteration_index: iterationIndex,
    status,
    error_code: errorCode,
    latency_ms: rounded(Math.max(0, performance.now() - startedAt)),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function timeoutError(error, signal) {
  return (
    signal.aborted ||
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError'
  );
}

function stableErrorCode(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/^http_\d{3}$/u.test(message)) return message;
  if (/^oidc_[a-z_]+(?::\d+)?$/u.test(message)) return message.split(':')[0];
  if (message === 'unexpected_ingress_outcome') return message;
  if (message.startsWith('invalid_')) return message;
  if (message.startsWith('missing_value:')) return 'missing_cli_value';
  if (message.startsWith('unknown_argument:')) return 'unknown_cli_argument';
  return 'request_failed';
}
