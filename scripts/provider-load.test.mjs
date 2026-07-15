import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  calculateProviderLoadMetrics,
  parseProviderLoadOptions,
  parseProviderLoadStages,
  readProviderApiKey,
  renderProviderLoadMarkdown,
  runProviderLoad,
  scanProviderLoadContent,
  writeProviderLoadReports,
} from './provider-load-lib.mjs';

const MODEL = 'reasoning-model-free';
const BASE_URL = 'https://provider.example.test/compatible/v1';

test('stage parser applies bounded defaults and accepts documented syntax', () => {
  assert.deepEqual(parseProviderLoadStages(), [
    { requests: 3, concurrency: 1 },
    { requests: 6, concurrency: 2 },
    { requests: 12, concurrency: 4 },
  ]);
  assert.deepEqual(parseProviderLoadStages('2@c1,8@4'), [
    { requests: 2, concurrency: 1 },
    { requests: 8, concurrency: 4 },
  ]);
  assert.throws(() => parseProviderLoadStages('501@1'), {
    code: 'invalid_stages',
  });
  assert.throws(() => parseProviderLoadStages('4@17'), {
    code: 'invalid_stages',
  });
});

test('CLI and environment options require a key file without accepting a key value', () => {
  assert.throws(
    () =>
      parseProviderLoadOptions(['--base-url', BASE_URL, '--model', MODEL], {}),
    { code: 'api_key_file_required' },
  );
  const options = parseProviderLoadOptions([], {
    PROVIDER_LOAD_API_KEY_FILE: '/secure/provider-key',
    PROVIDER_LOAD_BASE_URL: BASE_URL,
    PROVIDER_LOAD_MODEL: MODEL,
    PROVIDER_LOAD_STAGES: '3@1',
    PROVIDER_LOAD_TIMEOUT_MS: '45000',
    PROVIDER_LOAD_MAX_TOKENS: '1800',
  });
  assert.equal(options.apiKeyFile, '/secure/provider-key');
  assert.equal(options.timeoutMs, 45_000);
  assert.equal(options.maxTokens, 1_800);
  assert.throws(
    () =>
      parseProviderLoadOptions(
        ['--api-key', 'not-accepted', '--base-url', BASE_URL, '--model', MODEL],
        {},
      ),
    { code: 'invalid_cli_arguments' },
  );
});

test('CLI fails closed with a stable error when the key file is absent', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/provider-load.mjs',
      '--base-url',
      BASE_URL,
      '--model',
      MODEL,
    ],
    { cwd: process.cwd(), encoding: 'utf8', env: {} },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'provider_load_failed:api_key_file_required\n');
});

test('key reader rejects broad permissions and symbolic links', () => {
  const fixture = createKeyFixture();
  try {
    assert.equal(readProviderApiKey(fixture.keyPath), fixture.secret);
    chmodSync(fixture.keyPath, 0o644);
    assert.throws(() => readProviderApiKey(fixture.keyPath), {
      code: 'api_key_file_permissions_unsafe',
    });
    chmodSync(fixture.keyPath, 0o600);
    const linkPath = join(fixture.directory, 'key-link');
    symlinkSync(fixture.keyPath, linkPath);
    assert.throws(() => readProviderApiKey(linkPath), {
      code: 'api_key_file_type_unsafe',
    });
  } finally {
    fixture.cleanup();
  }
});

test('successful staged probe stores only bounded metadata and token counts', async () => {
  const fixture = createKeyFixture();
  const seen = [];
  try {
    const fetchImpl = async (url, init) => {
      seen.push({ url, init });
      return jsonResponse(200, {
        choices: [{ message: { content: 'provider content must not persist' } }],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 21,
          total_tokens: 29,
          completion_tokens_details: { reasoning_tokens: 18 },
        },
      });
    };
    const jsonPath = join(fixture.directory, 'run-provider-load.json');
    const markdownPath = join(fixture.directory, 'run-provider-load.md');
    const { report, reports } = await runProviderLoad({
      apiKeyFile: fixture.keyPath,
      baseUrl: BASE_URL,
      model: MODEL,
      stages: '3@c1,6@c2,12@c4',
      timeoutMs: 2_000,
      maxTokens: 1_500,
      fetchImpl,
      jsonPath,
      markdownPath,
    });

    assert.equal(report.status, 'ready');
    assert.equal(report.metrics.total_requests, 21);
    assert.equal(report.metrics.tokens.total_tokens, 609);
    assert.equal(report.metrics.tokens.reasoning_tokens, 378);
    assert.equal(report.scenario.max_tokens, 1_500);
    assert.ok(report.scenario.max_observed_concurrency <= 4);
    assert.equal(reports.jsonPath, jsonPath);
    assert.equal(reports.markdownPath, markdownPath);
    assert.equal(statSync(jsonPath).mode & 0o777, 0o600);
    assert.equal(statSync(markdownPath).mode & 0o777, 0o600);
    assert.equal(seen.length, 21);
    const requestBody = JSON.parse(seen[0].init.body);
    assert.equal(requestBody.max_tokens, 1_500);
    assert.equal(seen[0].url.pathname, '/compatible/v1/chat/completions');
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes(fixture.secret));
    assert.ok(!serialized.includes('provider content must not persist'));
    assert.ok(!serialized.includes('Respond with exactly'));
    assert.ok(!serialized.includes(BASE_URL));
    assert.ok(!serialized.includes('Authorization'));
  } finally {
    fixture.cleanup();
  }
});

test('probe stops when cumulative error rate exceeds ten percent', async () => {
  const fixture = createKeyFixture();
  let calls = 0;
  try {
    const { report } = await runProviderLoad({
      apiKeyFile: fixture.keyPath,
      baseUrl: BASE_URL,
      model: MODEL,
      stages: '10@c1,10@c1',
      timeoutMs: 2_000,
      fetchImpl: async () => {
        calls += 1;
        const credentialShapedError = `${'s'}${'k'}-rawProviderErrorMustNeverPersist123`;
        return calls === 9
          ? jsonResponse(500, {
              error: { message: credentialShapedError },
            })
          : successResponse();
      },
    });
    assert.equal(report.status, 'blocked');
    assert.equal(report.stop_reason, 'error_rate_exceeded');
    assert.equal(report.metrics.total_requests, 9);
    assert.equal(report.metrics.error_rate, 0.111111);
    assert.ok(!JSON.stringify(report).includes('rawProviderError'));
  } finally {
    fixture.cleanup();
  }
});

test('probe stops after three consecutive auth or rate-limit failures', async () => {
  const fixture = createKeyFixture();
  let calls = 0;
  try {
    const { report } = await runProviderLoad({
      apiKeyFile: fixture.keyPath,
      baseUrl: BASE_URL,
      model: MODEL,
      stages: '40@c1',
      timeoutMs: 2_000,
      fetchImpl: async () => {
        calls += 1;
        if (calls <= 30) return successResponse();
        return jsonResponse(calls % 2 === 0 ? 401 : 429, { ignored: true });
      },
    });
    assert.equal(report.status, 'blocked');
    assert.equal(
      report.stop_reason,
      'consecutive_auth_or_rate_limit_failures',
    );
    assert.equal(report.metrics.total_requests, 33);
  } finally {
    fixture.cleanup();
  }
});

test('a request timeout stops the remaining staged work', async () => {
  const fixture = createKeyFixture();
  try {
    const { report } = await runProviderLoad({
      apiKeyFile: fixture.keyPath,
      baseUrl: BASE_URL,
      model: MODEL,
      stages: '3@c1,3@c1',
      timeoutMs: 1_000,
      fetchImpl: async () => {
        const error = new Error('raw network details');
        error.name = 'AbortError';
        throw error;
      },
    });
    assert.equal(report.status, 'blocked');
    assert.equal(report.stop_reason, 'error_rate_exceeded');
    assert.equal(report.request_results[0].error_code, 'network_error');

    const timeoutReport = await runProviderLoad({
      apiKeyFile: fixture.keyPath,
      baseUrl: BASE_URL,
      model: MODEL,
      stages: '3@c1,3@c1',
      timeoutMs: 1_000,
      fetchImpl: (_url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('ignored')));
        }),
    });
    assert.equal(timeoutReport.report.status, 'blocked');
    assert.equal(timeoutReport.report.stop_reason, 'request_timeout');
    assert.equal(timeoutReport.report.metrics.total_requests, 1);
    assert.equal(timeoutReport.report.request_results[0].status, 'timeout');
  } finally {
    fixture.cleanup();
  }
});

test('metrics use nearest-rank percentiles and include throughput and errors', () => {
  const results = [10, 20, 30, 40, 100].map((latency, index) => ({
    status: index === 4 ? 'error' : 'success',
    latency_ms: latency,
    tokens: {
      prompt_tokens: 1,
      completion_tokens: 2,
      reasoning_tokens: 1,
      total_tokens: 3,
    },
  }));
  const metrics = calculateProviderLoadMetrics(results, 2_000);
  assert.equal(metrics.latency_ms.p50, 30);
  assert.equal(metrics.latency_ms.p95, 100);
  assert.equal(metrics.latency_ms.p99, 100);
  assert.equal(metrics.throughput_rps, 2.5);
  assert.equal(metrics.error_rate, 0.2);
  assert.equal(metrics.tokens.total_tokens, 15);
});

test('reports are private and credential scanner rejects shaped or exact secrets', () => {
  const fixture = createKeyFixture();
  try {
    const report = sampleReport();
    const jsonPath = join(fixture.directory, 'provider-load.json');
    const markdownPath = join(fixture.directory, 'provider-load.md');
    const paths = writeProviderLoadReports(report, {
      jsonPath,
      markdownPath,
      forbiddenSecrets: [fixture.secret],
    });
    assert.equal(statSync(paths.jsonPath).mode & 0o777, 0o600);
    assert.equal(statSync(paths.markdownPath).mode & 0o777, 0o600);
    assert.equal(scanProviderLoadContent(readFileSync(jsonPath, 'utf8')).length, 0);
    assert.match(renderProviderLoadMarkdown(report), /p99 \(ms\)/);

    const bearerCredential = [
      'Authorization',
      ': ',
      'Bearer',
      ' ',
      'abcdefghijk',
    ].join('');
    assert.ok(scanProviderLoadContent(bearerCredential).length > 0);
    assert.ok(scanProviderLoadContent(`value=${fixture.secret}`, [fixture.secret]).length > 0);
    assert.throws(
      () =>
        writeProviderLoadReports(
          { ...report, interpretation: `unsafe ${fixture.secret}` },
          {
            jsonPath,
            markdownPath,
            forbiddenSecrets: [fixture.secret],
          },
        ),
      { code: 'credential_content_detected' },
    );
  } finally {
    fixture.cleanup();
  }
});

function createKeyFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'provider-load-'));
  const keyPath = join(directory, 'provider-key');
  const secret = 'test-provider-credential-value-123456';
  writeFileSync(keyPath, `${secret}\n`, { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  return {
    directory,
    keyPath,
    secret,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successResponse() {
  return jsonResponse(200, {
    choices: [{ message: { content: 'OK' } }],
    usage: {
      prompt_tokens: 4,
      completion_tokens: 2,
      total_tokens: 6,
    },
  });
}

function sampleReport() {
  const metrics = calculateProviderLoadMetrics(
    [
      {
        status: 'success',
        latency_ms: 25,
        tokens: {
          prompt_tokens: 4,
          completion_tokens: 2,
          reasoning_tokens: 1,
          total_tokens: 6,
        },
      },
    ],
    25,
  );
  return {
    schema_version: 1,
    gate: 'direct-provider-load',
    generated_at: '2026-07-14T00:00:00.000Z',
    started_at: '2026-07-14T00:00:00.000Z',
    status: 'ready',
    stop_reason: null,
    scenario: {
      model: MODEL,
      stages: [{ requests: 1, concurrency: 1 }],
      timeout_ms: 30_000,
      max_tokens: 1_500,
      max_observed_concurrency: 1,
    },
    thresholds: {
      max_error_rate: 0.1,
      max_consecutive_auth_or_rate_limit_failures: 3,
      stop_on_timeout: true,
    },
    metrics,
    stages: [
      {
        stage: 1,
        configured_requests: 1,
        configured_concurrency: 1,
        executed_requests: 1,
        metrics,
      },
    ],
    request_results: [
      {
        request_id: 's1-r1',
        stage: 1,
        request_index: 1,
        completion_sequence: 1,
        status: 'success',
        error_code: null,
        http_status: 200,
        latency_ms: 25,
        tokens: {
          prompt_tokens: 4,
          completion_tokens: 2,
          reasoning_tokens: 1,
          total_tokens: 6,
        },
      },
    ],
    interpretation: 'Bounded direct-provider evidence only.',
  };
}
