import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildProductionLoadReport,
  calculateProductionHttpLoadMetrics,
  renderProductionLoadMarkdown,
  scanProductionLoadReportForSecrets,
  writeProductionLoadReports,
} from './production-load-lib.mjs';

test('calculates production HTTP load metrics with nearest-rank percentiles', () => {
  const metrics = calculateProductionHttpLoadMetrics(
    [
      iteration(0, 'succeeded', 10),
      iteration(1, 'succeeded', 20),
      iteration(2, 'error', 30, 'http_500'),
      iteration(3, 'timeout', 40, 'timeout'),
    ],
    200,
    2,
  );

  assert.equal(metrics.measured_iterations, 4);
  assert.equal(metrics.success_count, 2);
  assert.equal(metrics.error_count, 1);
  assert.equal(metrics.timeout_count, 1);
  assert.equal(metrics.error_rate, 0.5);
  assert.equal(metrics.throughput_per_second, 20);
  assert.equal(metrics.p50_latency_ms, 20);
  assert.equal(metrics.p95_latency_ms, 40);
  assert.equal(metrics.p99_latency_ms, 40);
});

test('builds a ready report when thresholds and delivery counts pass', () => {
  const report = buildProductionLoadReport({
    now: new Date('2026-07-07T00:00:00.000Z'),
    public_url: 'http://127.0.0.1:8088',
    tenant_id: '018f7f4a-7c1d-7b22-8d41-1234567890aa',
    scenario: {
      warmup_iterations: 1,
      measured_iterations: 3,
      concurrency: 2,
      request_timeout_ms: 1000,
    },
    thresholds: {
      max_error_count: 0,
      max_timeout_count: 0,
      max_error_rate: 0,
      max_p95_latency_ms: 100,
      min_throughput_per_second: 1,
    },
    warmup_results: [iteration(0, 'succeeded', 9)],
    measured_results: [
      iteration(0, 'succeeded', 10),
      iteration(1, 'succeeded', 20),
      iteration(2, 'succeeded', 30),
    ],
    duration_ms: 300,
    max_observed_concurrency: 2,
    delivery: { expected_messages: 4, observed_messages: 4 },
  });

  assert.equal(report.status, 'ready');
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.environment.tenant_ref.length, 12);
  assert.equal(report.iteration_results.length, 3);
});

test('blocks report on latency, errors, timeouts, throughput, warmup, and delivery gaps', () => {
  const report = buildProductionLoadReport({
    public_url: 'http://127.0.0.1:8088',
    scenario: {
      warmup_iterations: 1,
      measured_iterations: 2,
      concurrency: 1,
      request_timeout_ms: 1000,
    },
    thresholds: {
      max_error_count: 0,
      max_timeout_count: 0,
      max_error_rate: 0,
      max_p95_latency_ms: 25,
      min_throughput_per_second: 100,
    },
    warmup_results: [iteration(0, 'error', 9, 'http_500')],
    measured_results: [
      iteration(0, 'error', 30, 'http_500'),
      iteration(1, 'timeout', 40, 'timeout'),
    ],
    duration_ms: 1000,
    max_observed_concurrency: 1,
    delivery: { expected_messages: 2, observed_messages: 0 },
  });

  assert.equal(report.status, 'blocked');
  const reasons = new Set(report.checks.map((check) => check.reason_code));
  for (const reason of [
    'warmup_failed',
    'error_count_exceeded',
    'timeout_count_exceeded',
    'error_rate_exceeded',
    'p95_latency_exceeded',
    'throughput_below_threshold',
    'delivery_count_missing',
  ]) {
    assert.ok(reasons.has(reason), `missing ${reason}`);
  }
});

test('renders and writes secret-safe JSON and Markdown reports with private modes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-production-load-'));
  try {
    const report = buildProductionLoadReport({
      public_url: 'http://127.0.0.1:8088',
      scenario: {
        warmup_iterations: 0,
        measured_iterations: 1,
        concurrency: 1,
        request_timeout_ms: 1000,
      },
      warmup_results: [],
      measured_results: [iteration(0, 'succeeded', 12)],
      duration_ms: 50,
      max_observed_concurrency: 1,
      delivery: { expected_messages: 1, observed_messages: 1 },
    });
    const paths = writeProductionLoadReports(report, {
      jsonPath: join(directory, 'production-load.json'),
      markdownPath: join(directory, 'production-load.md'),
    });
    const output = [
      readFileSync(paths.jsonPath, 'utf8'),
      readFileSync(paths.markdownPath, 'utf8'),
      renderProductionLoadMarkdown(report),
    ].join('\n');

    assert.equal(JSON.parse(readFileSync(paths.jsonPath, 'utf8')).status, 'ready');
    assert.match(output, /Production HTTP Load Report/);
    assert.equal(scanProductionLoadReportForSecrets(output).length, 0);
    assert.equal(statSync(paths.jsonPath).mode & 0o077, 0);
    assert.equal(statSync(paths.markdownPath).mode & 0o077, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('secret scanner rejects credential-shaped report content', () => {
  const findings = scanProductionLoadReportForSecrets(
    'AGENTOPS_POSTGRES_PASSWORD=super-secret\nCookie: sid=value',
  );
  assert.ok(findings.length >= 2);
});

test('CLI reports startup validation failures with stable codes', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/production-load.mjs', '--unknown-production-load-flag'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /production_load_failed:unknown_cli_argument/);
  assert.doesNotMatch(result.stderr, /Error:|at /);
});

function iteration(iterationIndex, status, latencyMs, errorCode = null) {
  return {
    iteration_index: iterationIndex,
    status,
    error_code: errorCode,
    latency_ms: latencyMs,
  };
}
