import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_PRODUCTION_LOAD_SCENARIO = Object.freeze({
  warmup_iterations: 2,
  measured_iterations: 20,
  concurrency: 4,
  request_timeout_ms: 10_000,
  iteration_delay_ms: 0,
  include_operator_read_probe: true,
});

export const DEFAULT_PRODUCTION_LOAD_THRESHOLDS = Object.freeze({
  max_error_count: 0,
  max_timeout_count: 0,
  max_error_rate: 0,
  max_p95_latency_ms: 5_000,
  min_throughput_per_second: 0.5,
});

const SENSITIVE_PATTERNS = [
  /AGENTOPS_[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY)[A-Z0-9_]*=/u,
  /SMOKE_[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY)[A-Z0-9_]*=/u,
  /Cookie:\s*[^|\n]+/iu,
  /x-csrf-token/iu,
  /base64url:[A-Za-z0-9_-]{20,}/u,
  /postgresql:\/\/[^|\s]+/iu,
  /redis:\/\/[^|\s]+/iu,
];

export function calculateProductionHttpLoadMetrics(
  results,
  durationMs,
  maxObservedConcurrency,
) {
  validateMetricInputs(results, durationMs, maxObservedConcurrency);
  const measuredIterations = results.length;
  const successCount = results.filter((result) => result.status === 'succeeded')
    .length;
  const errorCount = results.filter((result) => result.status === 'error')
    .length;
  const timeoutCount = results.filter((result) => result.status === 'timeout')
    .length;
  const latencies = results.map((result) => result.latency_ms).sort(numberSort);
  return Object.freeze({
    measured_iterations: measuredIterations,
    success_count: successCount,
    error_count: errorCount,
    timeout_count: timeoutCount,
    error_rate: rounded((errorCount + timeoutCount) / measuredIterations, 4),
    duration_ms: rounded(durationMs),
    throughput_per_second: rounded(measuredIterations / (durationMs / 1000), 3),
    p50_latency_ms: percentileNearestRank(latencies, 0.5),
    p95_latency_ms: percentileNearestRank(latencies, 0.95),
    p99_latency_ms: percentileNearestRank(latencies, 0.99),
    max_observed_concurrency: maxObservedConcurrency,
  });
}

export function buildProductionLoadReport(input) {
  const scenario = normalizeScenario(input.scenario);
  const thresholds = normalizeThresholds(input.thresholds);
  const metrics = calculateProductionHttpLoadMetrics(
    input.measured_results,
    input.duration_ms,
    input.max_observed_concurrency,
  );
  const warmup = summarizeWarmup(input.warmup_results);
  const delivery = Object.freeze({
    expected_messages: input.delivery?.expected_messages ?? metrics.success_count,
    observed_messages: input.delivery?.observed_messages ?? 0,
  });
  const checks = [
    ...(input.setup_checks ?? []),
    ...buildThresholdChecks(metrics, thresholds, delivery, warmup),
  ];
  const status = checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'ready';
  return Object.freeze({
    schema_version: 1,
    generated_at: (input.now ?? new Date()).toISOString(),
    gate: 'production-http-load',
    status,
    summary: {
      ready: checks.filter((check) => check.status === 'ready').length,
      warning: checks.filter((check) => check.status === 'warning').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
    },
    environment: Object.freeze({
      public_origin: safeOrigin(input.public_url),
      provider: 'deterministic-smoke-provider',
      chatwoot: 'deterministic-smoke-chatwoot',
      tenant_ref: input.tenant_id ? hashRef(input.tenant_id) : null,
    }),
    scenario,
    thresholds,
    warmup,
    metrics,
    delivery,
    checks: Object.freeze(checks),
    iteration_results: Object.freeze(input.measured_results.map(safeIteration)),
    interpretation_boundary: Object.freeze([
      'Measures the local production-style HTTP path through Compose and deterministic mocks.',
      'Does not measure public internet capacity, live provider latency, live Chatwoot SaaS latency, or SaaS control-plane readiness.',
      'Reports are secret-safe and intentionally exclude cookies, tokens, provider payloads, customer text, and database URLs.',
    ]),
  });
}

export function renderProductionLoadMarkdown(report) {
  const lines = [
    '# Production HTTP Load Report',
    '',
    `**Generated:** ${report.generated_at}`,
    `**Status:** ${report.status}`,
    `**Public origin:** ${report.environment.public_origin}`,
    `**Tenant ref:** ${report.environment.tenant_ref ?? 'n/a'}`,
    '',
    '## Scenario',
    '',
    `- Warmup iterations: ${report.scenario.warmup_iterations}`,
    `- Measured iterations: ${report.scenario.measured_iterations}`,
    `- Concurrency: ${report.scenario.concurrency}`,
    `- Request timeout: ${report.scenario.request_timeout_ms} ms`,
    `- Iteration delay: ${report.scenario.iteration_delay_ms} ms`,
    `- Operator read probe: ${report.scenario.include_operator_read_probe ? 'enabled' : 'disabled'}`,
    '',
    '## Metrics',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Success | ${report.metrics.success_count} |`,
    `| Errors | ${report.metrics.error_count} |`,
    `| Timeouts | ${report.metrics.timeout_count} |`,
    `| Error rate | ${(report.metrics.error_rate * 100).toFixed(2)}% |`,
    `| Throughput/s | ${report.metrics.throughput_per_second} |`,
    `| p50 latency ms | ${report.metrics.p50_latency_ms} |`,
    `| p95 latency ms | ${report.metrics.p95_latency_ms} |`,
    `| p99 latency ms | ${report.metrics.p99_latency_ms} |`,
    `| Max observed concurrency | ${report.metrics.max_observed_concurrency} |`,
    '',
    '## Delivery',
    '',
    `- Expected mock Chatwoot messages: ${report.delivery.expected_messages}`,
    `- Observed mock Chatwoot messages: ${report.delivery.observed_messages}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Reason |',
    '|---|---|---|',
  ];
  for (const check of report.checks) {
    lines.push(`| ${check.id} | ${check.status} | ${check.reason_code} |`);
  }
  lines.push('', '## Interpretation Boundary', '');
  for (const item of report.interpretation_boundary) {
    lines.push(`- ${item}`);
  }
  return `${lines.join('\n')}\n`;
}

export function writeProductionLoadReports(report, options = {}) {
  const jsonPath = resolve(options.jsonPath ?? 'tmp/production-load.json');
  const markdownPath = resolve(
    options.markdownPath ?? 'tmp/production-load.md',
  );
  mkdirSync(dirname(jsonPath), { recursive: true });
  mkdirSync(dirname(markdownPath), { recursive: true });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderProductionLoadMarkdown(report);
  assertSecretSafe(json);
  assertSecretSafe(markdown);
  writeFileSync(jsonPath, json, { mode: 0o600 });
  writeFileSync(markdownPath, markdown, { mode: 0o600 });
  return { jsonPath, markdownPath };
}

export function scanProductionLoadReportForSecrets(text) {
  return SENSITIVE_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => ({ pattern: pattern.source }));
}

export function normalizeScenario(input = {}) {
  const scenario = {
    ...DEFAULT_PRODUCTION_LOAD_SCENARIO,
    ...input,
  };
  for (const key of [
    'warmup_iterations',
    'measured_iterations',
    'concurrency',
    'request_timeout_ms',
    'iteration_delay_ms',
  ]) {
    if (
      !Number.isInteger(scenario[key]) ||
      scenario[key] <
        (['warmup_iterations', 'iteration_delay_ms'].includes(key) ? 0 : 1)
    ) {
      throw new Error(`invalid_scenario:${key}`);
    }
  }
  if (scenario.concurrency > scenario.measured_iterations) {
    scenario.concurrency = scenario.measured_iterations;
  }
  scenario.include_operator_read_probe =
    scenario.include_operator_read_probe !== false;
  return Object.freeze(scenario);
}

export function normalizeThresholds(input = {}) {
  const thresholds = {
    ...DEFAULT_PRODUCTION_LOAD_THRESHOLDS,
    ...input,
  };
  for (const [key, value] of Object.entries(thresholds)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`invalid_threshold:${key}`);
    }
  }
  return Object.freeze(thresholds);
}

export function safeIteration(result) {
  return Object.freeze({
    iteration_index: result.iteration_index,
    status: result.status,
    error_code: result.error_code ?? null,
    latency_ms: result.latency_ms,
  });
}

export function loadCheck(id, status, reasonCode, evidence = {}) {
  return Object.freeze({
    id,
    status,
    reason_code: reasonCode,
    evidence: Object.freeze({ ...evidence }),
  });
}

export function rounded(value, decimals = 3) {
  return Number(value.toFixed(decimals));
}

function buildThresholdChecks(metrics, thresholds, delivery, warmup) {
  const checks = [];
  checks.push(
    warmup.failed === 0
      ? loadCheck('warmup', 'ready', 'warmup_succeeded', {
          iterations: warmup.iterations,
        })
      : loadCheck('warmup', 'blocked', 'warmup_failed', {
          failed: warmup.failed,
        }),
  );
  checks.push(
    metrics.error_count <= thresholds.max_error_count
      ? loadCheck('error_count', 'ready', 'error_count_within_threshold', {
          count: metrics.error_count,
        })
      : loadCheck('error_count', 'blocked', 'error_count_exceeded', {
          count: metrics.error_count,
          threshold: thresholds.max_error_count,
        }),
  );
  checks.push(
    metrics.timeout_count <= thresholds.max_timeout_count
      ? loadCheck('timeout_count', 'ready', 'timeout_count_within_threshold', {
          count: metrics.timeout_count,
        })
      : loadCheck('timeout_count', 'blocked', 'timeout_count_exceeded', {
          count: metrics.timeout_count,
          threshold: thresholds.max_timeout_count,
        }),
  );
  checks.push(
    metrics.error_rate <= thresholds.max_error_rate
      ? loadCheck('error_rate', 'ready', 'error_rate_within_threshold', {
          rate: metrics.error_rate,
        })
      : loadCheck('error_rate', 'blocked', 'error_rate_exceeded', {
          rate: metrics.error_rate,
          threshold: thresholds.max_error_rate,
        }),
  );
  checks.push(
    metrics.p95_latency_ms <= thresholds.max_p95_latency_ms
      ? loadCheck('p95_latency', 'ready', 'p95_latency_within_threshold', {
          latency_ms: metrics.p95_latency_ms,
        })
      : loadCheck('p95_latency', 'blocked', 'p95_latency_exceeded', {
          latency_ms: metrics.p95_latency_ms,
          threshold_ms: thresholds.max_p95_latency_ms,
        }),
  );
  checks.push(
    metrics.throughput_per_second >= thresholds.min_throughput_per_second
      ? loadCheck('throughput', 'ready', 'throughput_within_threshold', {
          throughput_per_second: metrics.throughput_per_second,
        })
      : loadCheck('throughput', 'blocked', 'throughput_below_threshold', {
          throughput_per_second: metrics.throughput_per_second,
          threshold: thresholds.min_throughput_per_second,
        }),
  );
  checks.push(
    delivery.observed_messages >= delivery.expected_messages
      ? loadCheck('chatwoot_delivery', 'ready', 'delivery_count_confirmed', {
          expected: delivery.expected_messages,
          observed: delivery.observed_messages,
        })
      : loadCheck('chatwoot_delivery', 'blocked', 'delivery_count_missing', {
          expected: delivery.expected_messages,
          observed: delivery.observed_messages,
        }),
  );
  return checks;
}

function summarizeWarmup(results = []) {
  return Object.freeze({
    iterations: results.length,
    succeeded: results.filter((result) => result.status === 'succeeded')
      .length,
    failed: results.filter((result) => result.status !== 'succeeded').length,
  });
}

function validateMetricInputs(results, durationMs, maxObservedConcurrency) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('invalid_load_results');
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('invalid_load_duration');
  }
  if (
    !Number.isInteger(maxObservedConcurrency) ||
    maxObservedConcurrency <= 0
  ) {
    throw new Error('invalid_load_concurrency');
  }
  const seen = new Set();
  for (const result of results) {
    if (
      !Number.isInteger(result.iteration_index) ||
      result.iteration_index < 0 ||
      result.iteration_index >= results.length ||
      seen.has(result.iteration_index) ||
      !['succeeded', 'error', 'timeout'].includes(result.status) ||
      !Number.isFinite(result.latency_ms) ||
      result.latency_ms < 0
    ) {
      throw new Error('invalid_load_iteration');
    }
    seen.add(result.iteration_index);
  }
}

function percentileNearestRank(sortedValues, quantile) {
  const index = Math.max(0, Math.ceil(quantile * sortedValues.length) - 1);
  return rounded(sortedValues[index]);
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return 'unknown';
  }
}

function hashRef(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function numberSort(left, right) {
  return left - right;
}

function assertSecretSafe(text) {
  const findings = scanProductionLoadReportForSecrets(text);
  if (findings.length > 0) {
    throw new Error('production_load_report_contains_sensitive_value');
  }
}
