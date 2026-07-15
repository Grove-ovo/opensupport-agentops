import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

export const DEFAULT_PROVIDER_LOAD_STAGES = Object.freeze([
  Object.freeze({ requests: 3, concurrency: 1 }),
  Object.freeze({ requests: 6, concurrency: 2 }),
  Object.freeze({ requests: 12, concurrency: 4 }),
]);

export const PROVIDER_LOAD_LIMITS = Object.freeze({
  maxStages: 10,
  maxRequestsPerStage: 100,
  maxTotalRequests: 500,
  maxConcurrency: 16,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 120_000,
  minMaxTokens: 256,
  maxMaxTokens: 4_096,
});

export const PROVIDER_LOAD_THRESHOLDS = Object.freeze({
  maxErrorRate: 0.1,
  maxConsecutiveAuthOrRateLimitFailures: 3,
});

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1_500;
const FIXED_PROBE_PROMPT = 'Respond with exactly the word OK.';
const SAFE_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const CREDENTIAL_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/i,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/._~=-]{8,}\b/i,
  /\b(?:api[_-]?key|authorization|access[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']?[^"'\s,}]{8,}/i,
  /https?:\/\/[^/\s:@]+:[^@\s/]+@/i,
];

export class ProviderLoadError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProviderLoadError';
    this.code = code;
  }
}

export function parseProviderLoadStages(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_PROVIDER_LOAD_STAGES.map((stage) => ({ ...stage }));
  }
  if (typeof value !== 'string') throw invalid('invalid_stages');

  const parts = value.split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.length > PROVIDER_LOAD_LIMITS.maxStages) {
    throw invalid('invalid_stages');
  }

  const stages = parts.map((part) => {
    const match = /^(\d+)@c?(\d+)$/.exec(part);
    if (!match) throw invalid('invalid_stages');
    const requests = Number(match[1]);
    const concurrency = Number(match[2]);
    if (
      !Number.isSafeInteger(requests) ||
      requests < 1 ||
      requests > PROVIDER_LOAD_LIMITS.maxRequestsPerStage ||
      !Number.isSafeInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > PROVIDER_LOAD_LIMITS.maxConcurrency ||
      concurrency > requests
    ) {
      throw invalid('invalid_stages');
    }
    return { requests, concurrency };
  });

  const totalRequests = stages.reduce((sum, stage) => sum + stage.requests, 0);
  if (totalRequests > PROVIDER_LOAD_LIMITS.maxTotalRequests) {
    throw invalid('invalid_stages');
  }
  return stages;
}

export function parseProviderLoadOptions(argv, env = process.env) {
  const cli = parseArguments(argv);
  const stages = parseProviderLoadStages(
    cli.stages ?? env.PROVIDER_LOAD_STAGES,
  );
  const timeoutMs = parseBoundedInteger(
    cli.timeoutMs ?? env.PROVIDER_LOAD_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
    'invalid_timeout_ms',
    PROVIDER_LOAD_LIMITS.minTimeoutMs,
    PROVIDER_LOAD_LIMITS.maxTimeoutMs,
  );
  const maxTokens = parseBoundedInteger(
    cli.maxTokens ?? env.PROVIDER_LOAD_MAX_TOKENS ?? String(DEFAULT_MAX_TOKENS),
    'invalid_max_tokens',
    PROVIDER_LOAD_LIMITS.minMaxTokens,
    PROVIDER_LOAD_LIMITS.maxMaxTokens,
  );
  const apiKeyFile = cli.apiKeyFile ?? env.PROVIDER_LOAD_API_KEY_FILE;
  const baseUrl = cli.baseUrl ?? env.PROVIDER_LOAD_BASE_URL;
  const model = cli.model ?? env.PROVIDER_LOAD_MODEL;
  if (!apiKeyFile) throw invalid('api_key_file_required');
  if (!baseUrl) throw invalid('base_url_required');
  if (!model) throw invalid('model_required');
  validateProviderEndpoint(baseUrl);
  validateModel(model);

  return {
    apiKeyFile,
    baseUrl,
    model,
    stages,
    timeoutMs,
    maxTokens,
    jsonPath:
      cli.jsonPath ??
      env.PROVIDER_LOAD_JSON_PATH ??
      'tmp/provider-load.json',
    markdownPath:
      cli.markdownPath ??
      env.PROVIDER_LOAD_MARKDOWN_PATH ??
      'tmp/provider-load.md',
  };
}

export function readProviderApiKey(apiKeyFile) {
  if (!apiKeyFile) throw invalid('api_key_file_required');
  const path = resolve(apiKeyFile);
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    throw invalid('api_key_file_unreadable');
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw invalid('api_key_file_type_unsafe');
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw invalid('api_key_file_permissions_unsafe');
  }

  let value;
  try {
    value = readFileSync(path, 'utf8').trim();
  } catch {
    throw invalid('api_key_file_unreadable');
  }
  if (value.length < 8 || /[\r\n\0]/.test(value)) {
    throw invalid('api_key_file_invalid');
  }
  return value;
}

export async function runProviderLoad(options) {
  const stages = validateStages(options.stages);
  validateModel(options.model);
  const endpoint = validateProviderEndpoint(options.baseUrl);
  const timeoutMs = parseBoundedInteger(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    'invalid_timeout_ms',
    PROVIDER_LOAD_LIMITS.minTimeoutMs,
    PROVIDER_LOAD_LIMITS.maxTimeoutMs,
  );
  const maxTokens = parseBoundedInteger(
    options.maxTokens ?? DEFAULT_MAX_TOKENS,
    'invalid_max_tokens',
    PROVIDER_LOAD_LIMITS.minMaxTokens,
    PROVIDER_LOAD_LIMITS.maxMaxTokens,
  );
  const apiKey = readProviderApiKey(options.apiKeyFile);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw invalid('fetch_unavailable');
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());

  const startedAt = now();
  const runStartedMs = monotonicNow();
  const requestResults = [];
  const stageResults = [];
  const stopState = {
    reason: null,
    consecutiveAuthOrRateLimitFailures: 0,
    completionSequence: 0,
  };
  let maxObservedConcurrency = 0;
  let activeRequests = 0;

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    if (stopState.reason) break;
    const stage = stages[stageIndex];
    const stageStartedMs = monotonicNow();
    let nextRequestIndex = 0;
    const currentStageResults = [];

    const worker = async () => {
      while (!stopState.reason) {
        const requestIndex = nextRequestIndex;
        nextRequestIndex += 1;
        if (requestIndex >= stage.requests) return;

        activeRequests += 1;
        maxObservedConcurrency = Math.max(
          maxObservedConcurrency,
          activeRequests,
        );
        let result;
        try {
          result = await performProviderRequest({
            endpoint,
            model: options.model,
            apiKey,
            timeoutMs,
            maxTokens,
            fetchImpl,
            monotonicNow,
          });
        } finally {
          activeRequests -= 1;
        }

        stopState.completionSequence += 1;
        const record = {
          request_id: `s${stageIndex + 1}-r${requestIndex + 1}`,
          stage: stageIndex + 1,
          request_index: requestIndex + 1,
          completion_sequence: stopState.completionSequence,
          ...result,
        };
        requestResults.push(record);
        currentStageResults.push(record);
        updateStopState(stopState, requestResults, record);
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(stage.concurrency, stage.requests) },
        () => worker(),
      ),
    );
    const durationMs = Math.max(0, monotonicNow() - stageStartedMs);
    stageResults.push({
      stage: stageIndex + 1,
      configured_requests: stage.requests,
      configured_concurrency: stage.concurrency,
      executed_requests: currentStageResults.length,
      metrics: calculateProviderLoadMetrics(currentStageResults, durationMs),
    });
  }

  const durationMs = Math.max(0, monotonicNow() - runStartedMs);
  const metrics = calculateProviderLoadMetrics(requestResults, durationMs);
  const report = {
    schema_version: 1,
    gate: 'direct-provider-load',
    generated_at: now().toISOString(),
    started_at: startedAt.toISOString(),
    status: stopState.reason ? 'blocked' : 'ready',
    stop_reason: stopState.reason,
    scenario: {
      model: options.model,
      stages,
      timeout_ms: timeoutMs,
      max_tokens: maxTokens,
      max_observed_concurrency: maxObservedConcurrency,
    },
    thresholds: {
      max_error_rate: PROVIDER_LOAD_THRESHOLDS.maxErrorRate,
      max_consecutive_auth_or_rate_limit_failures:
        PROVIDER_LOAD_THRESHOLDS.maxConsecutiveAuthOrRateLimitFailures,
      stop_on_timeout: true,
    },
    metrics,
    stages: stageResults,
    request_results: requestResults.sort(
      (left, right) => left.completion_sequence - right.completion_sequence,
    ),
    interpretation:
      'This bounded direct-provider probe measures one caller path and does not establish application, regional, or provider-wide capacity.',
  };

  let reports = null;
  if (options.jsonPath || options.markdownPath) {
    if (!options.jsonPath || !options.markdownPath) {
      throw invalid('both_report_paths_required');
    }
    reports = writeProviderLoadReports(report, {
      jsonPath: options.jsonPath,
      markdownPath: options.markdownPath,
      forbiddenSecrets: [apiKey],
    });
  }
  return { report, reports };
}

export async function performProviderRequest(options) {
  const startedMs = options.monotonicNow();
  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ProviderLoadError('timeout'));
    }, options.timeoutMs);
  });

  try {
    const operation = async () => {
      const response = await options.fetchImpl(options.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          messages: [{ role: 'user', content: FIXED_PROBE_PROMPT }],
          max_tokens: options.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response || typeof response.status !== 'number') {
        return failedResult(
          'invalid_response',
          null,
          roundedLatency(options.monotonicNow() - startedMs),
        );
      }
      if (!response.ok) {
        if (response.body) await response.body.cancel().catch(() => {});
        return classifyHttpFailure(
          response.status,
          roundedLatency(options.monotonicNow() - startedMs),
        );
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        return failedResult(
          'invalid_response',
          response.status,
          roundedLatency(options.monotonicNow() - startedMs),
        );
      }
      const latencyMs = roundedLatency(options.monotonicNow() - startedMs);
      if (
        !payload ||
        !Array.isArray(payload.choices) ||
        payload.choices.length < 1
      ) {
        return failedResult('invalid_response', response.status, latencyMs);
      }
      return {
        status: 'success',
        error_code: null,
        http_status: response.status,
        latency_ms: latencyMs,
        tokens: safeTokenUsage(payload.usage),
      };
    };
    return await Promise.race([operation(), timeout]);
  } catch (error) {
    const latencyMs = roundedLatency(options.monotonicNow() - startedMs);
    if (
      timedOut ||
      controller.signal.aborted ||
      (error instanceof ProviderLoadError && error.code === 'timeout')
    ) {
      return failedResult('timeout', null, latencyMs, 'timeout');
    }
    return failedResult('network_error', null, latencyMs);
  } finally {
    clearTimeout(timer);
  }
}

export function calculateProviderLoadMetrics(results, durationMs) {
  const latencies = results
    .map((result) => result.latency_ms)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const successCount = results.filter(
    (result) => result.status === 'success',
  ).length;
  const timeoutCount = results.filter(
    (result) => result.status === 'timeout',
  ).length;
  const errorCount = results.length - successCount;
  const usage = results.map((result) => result.tokens);
  const knownUsage = usage.filter(
    (tokens) => tokens && Number.isInteger(tokens.total_tokens),
  );

  return {
    total_requests: results.length,
    success_count: successCount,
    error_count: errorCount,
    timeout_count: timeoutCount,
    error_rate: ratio(errorCount, results.length),
    duration_ms: roundedLatency(durationMs),
    throughput_rps:
      durationMs > 0 ? round(results.length / (durationMs / 1_000), 4) : 0,
    latency_ms: {
      p50: nearestRank(latencies, 0.5),
      p95: nearestRank(latencies, 0.95),
      p99: nearestRank(latencies, 0.99),
      min: latencies.length > 0 ? Math.min(...latencies) : null,
      max: latencies.length > 0 ? Math.max(...latencies) : null,
    },
    tokens: {
      usage_reported_requests: knownUsage.length,
      prompt_tokens: sumTokenField(knownUsage, 'prompt_tokens'),
      completion_tokens: sumTokenField(knownUsage, 'completion_tokens'),
      reasoning_tokens: sumTokenField(knownUsage, 'reasoning_tokens'),
      total_tokens: sumTokenField(knownUsage, 'total_tokens'),
    },
  };
}

export function scanProviderLoadContent(text, forbiddenSecrets = []) {
  if (typeof text !== 'string') return ['report_not_text'];
  const findings = [];
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) findings.push(`credential_pattern:${pattern.source}`);
  }
  for (const secret of forbiddenSecrets) {
    if (typeof secret === 'string' && secret.length >= 8 && text.includes(secret)) {
      findings.push('exact_secret_match');
    }
  }
  return findings;
}

export function writeProviderLoadReports(report, options = {}) {
  const jsonPath = resolve(options.jsonPath ?? 'tmp/provider-load.json');
  const markdownPath = resolve(
    options.markdownPath ?? 'tmp/provider-load.md',
  );
  if (jsonPath === markdownPath) throw invalid('report_paths_must_differ');

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderProviderLoadMarkdown(report);
  assertSecretSafe(json, options.forbiddenSecrets);
  assertSecretSafe(markdown, options.forbiddenSecrets);
  writePrivateFileAtomic(jsonPath, json);
  writePrivateFileAtomic(markdownPath, markdown);

  try {
    assertSecretSafe(readFileSync(jsonPath, 'utf8'), options.forbiddenSecrets);
    assertSecretSafe(
      readFileSync(markdownPath, 'utf8'),
      options.forbiddenSecrets,
    );
  } catch (error) {
    rmSync(jsonPath, { force: true });
    rmSync(markdownPath, { force: true });
    throw error;
  }
  return { jsonPath, markdownPath };
}

export function renderProviderLoadMarkdown(report) {
  const metrics = report.metrics;
  const lines = [
    '# Direct Provider Load Report',
    '',
    `- Status: **${report.status}**`,
    `- Generated: ${report.generated_at}`,
    `- Model: ${report.scenario.model}`,
    `- Stop reason: ${report.stop_reason ?? 'none'}`,
    '',
    '## Aggregate',
    '',
    '| Requests | Success | Errors | Timeouts | Error rate | Throughput (req/s) | p50 (ms) | p95 (ms) | p99 (ms) |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    `| ${metrics.total_requests} | ${metrics.success_count} | ${metrics.error_count} | ${metrics.timeout_count} | ${formatRate(metrics.error_rate)} | ${metrics.throughput_rps} | ${formatNullable(metrics.latency_ms.p50)} | ${formatNullable(metrics.latency_ms.p95)} | ${formatNullable(metrics.latency_ms.p99)} |`,
    '',
    '## Tokens',
    '',
    `- Usage reported: ${metrics.tokens.usage_reported_requests}/${metrics.total_requests}`,
    `- Prompt: ${metrics.tokens.prompt_tokens}`,
    `- Completion: ${metrics.tokens.completion_tokens}`,
    `- Reasoning: ${metrics.tokens.reasoning_tokens}`,
    `- Total: ${metrics.tokens.total_tokens}`,
    '',
    '## Stages',
    '',
    '| Stage | Configured requests | Concurrency | Executed | Error rate | p95 (ms) | Throughput (req/s) |',
    '|---:|---:|---:|---:|---:|---:|---:|',
    ...report.stages.map(
      (stage) =>
        `| ${stage.stage} | ${stage.configured_requests} | ${stage.configured_concurrency} | ${stage.executed_requests} | ${formatRate(stage.metrics.error_rate)} | ${formatNullable(stage.metrics.latency_ms.p95)} | ${stage.metrics.throughput_rps} |`,
    ),
    '',
    '## Requests',
    '',
    '| Request | Stage | Status | Stable error | HTTP | Latency (ms) | Prompt tokens | Completion tokens | Reasoning tokens | Total tokens |',
    '|---|---:|---|---|---:|---:|---:|---:|---:|---:|',
    ...report.request_results.map(
      (result) =>
        `| ${result.request_id} | ${result.stage} | ${result.status} | ${result.error_code ?? '-'} | ${formatNullable(result.http_status)} | ${result.latency_ms} | ${formatNullable(result.tokens.prompt_tokens)} | ${formatNullable(result.tokens.completion_tokens)} | ${formatNullable(result.tokens.reasoning_tokens)} | ${formatNullable(result.tokens.total_tokens)} |`,
    ),
    '',
    '## Interpretation Boundary',
    '',
    report.interpretation,
    '',
  ];
  return lines.join('\n');
}

function parseArguments(argv) {
  const values = {};
  const definitions = new Map([
    ['--api-key-file', 'apiKeyFile'],
    ['--base-url', 'baseUrl'],
    ['--model', 'model'],
    ['--json', 'jsonPath'],
    ['--markdown', 'markdownPath'],
    ['--stages', 'stages'],
    ['--timeout-ms', 'timeoutMs'],
    ['--max-tokens', 'maxTokens'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = definitions.get(argv[index]);
    if (!key || index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      throw invalid('invalid_cli_arguments');
    }
    values[key] = argv[index + 1];
    index += 1;
  }
  return values;
}

function validateStages(stages) {
  if (stages === undefined) return parseProviderLoadStages();
  if (typeof stages === 'string') return parseProviderLoadStages(stages);
  if (!Array.isArray(stages)) throw invalid('invalid_stages');
  return parseProviderLoadStages(
    stages.map((stage) => `${stage.requests}@c${stage.concurrency}`).join(','),
  );
}

function validateProviderEndpoint(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw invalid('invalid_base_url');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw invalid('invalid_base_url');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/chat/completions')) {
    url.pathname = path;
  } else if (path.endsWith('/v1')) {
    url.pathname = `${path}/chat/completions`;
  } else {
    url.pathname = `${path}/v1/chat/completions`;
  }
  return url;
}

function validateModel(model) {
  if (typeof model !== 'string' || !SAFE_MODEL_PATTERN.test(model)) {
    throw invalid('invalid_model');
  }
}

function parseBoundedInteger(value, code, minimum, maximum) {
  if (!/^\d+$/.test(String(value))) throw invalid(code);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw invalid(code);
  }
  return number;
}

function updateStopState(state, results, latest) {
  if (state.reason) return;
  if (latest.status === 'timeout') {
    state.reason = 'request_timeout';
    return;
  }
  if (['auth_failed', 'rate_limited'].includes(latest.error_code)) {
    state.consecutiveAuthOrRateLimitFailures += 1;
  } else {
    state.consecutiveAuthOrRateLimitFailures = 0;
  }
  if (
    state.consecutiveAuthOrRateLimitFailures >=
    PROVIDER_LOAD_THRESHOLDS.maxConsecutiveAuthOrRateLimitFailures
  ) {
    state.reason = 'consecutive_auth_or_rate_limit_failures';
    return;
  }
  const errorCount = results.filter((result) => result.status !== 'success').length;
  if (errorCount / results.length > PROVIDER_LOAD_THRESHOLDS.maxErrorRate) {
    state.reason = 'error_rate_exceeded';
  }
}

function classifyHttpFailure(httpStatus, latencyMs) {
  if (httpStatus === 401 || httpStatus === 403) {
    return failedResult('auth_failed', httpStatus, latencyMs);
  }
  if (httpStatus === 429) {
    return failedResult('rate_limited', httpStatus, latencyMs);
  }
  if (httpStatus === 408 || httpStatus === 504) {
    return failedResult('timeout', httpStatus, latencyMs, 'timeout');
  }
  if (httpStatus >= 500) {
    return failedResult('provider_server_error', httpStatus, latencyMs);
  }
  if (httpStatus >= 400) {
    return failedResult('provider_request_rejected', httpStatus, latencyMs);
  }
  return failedResult('invalid_response', httpStatus, latencyMs);
}

function failedResult(errorCode, httpStatus, latencyMs, status = 'error') {
  return {
    status,
    error_code: errorCode,
    http_status: httpStatus,
    latency_ms: latencyMs,
    tokens: emptyTokenUsage(),
  };
}

function safeTokenUsage(usage) {
  const details = usage?.completion_tokens_details;
  return {
    prompt_tokens: safeToken(usage?.prompt_tokens),
    completion_tokens: safeToken(usage?.completion_tokens),
    reasoning_tokens: safeToken(details?.reasoning_tokens),
    total_tokens: safeToken(usage?.total_tokens),
  };
}

function emptyTokenUsage() {
  return {
    prompt_tokens: null,
    completion_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
  };
}

function safeToken(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sumTokenField(usages, field) {
  return usages.reduce((sum, usage) => sum + (usage[field] ?? 0), 0);
}

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

function ratio(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator, 6) : 0;
}

function roundedLatency(value) {
  return round(Math.max(0, value), 3);
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatRate(value) {
  return `${round(value * 100, 2)}%`;
}

function formatNullable(value) {
  return value === null || value === undefined ? '-' : String(value);
}

function assertSecretSafe(content, forbiddenSecrets = []) {
  const findings = scanProviderLoadContent(content, forbiddenSecrets);
  if (findings.length > 0) throw invalid('credential_content_detected');
}

function writePrivateFileAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, content, { mode: 0o600, flag: 'wx' });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, path);
    chmodSync(path, 0o600);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function invalid(code) {
  return new ProviderLoadError(code);
}
