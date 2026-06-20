import { readFile, writeFile } from 'node:fs/promises';
import {
  createBenchmarkComparison,
  createLoadScenarioResults,
  generatedAt,
  tenantBudget,
} from './phase5-report-fixtures.mjs';

const checkOnly = process.argv.includes('--check');
const comparison = await createBenchmarkComparison();
const loadResults = await createLoadScenarioResults();
const outputs = new Map([
  ['reports/load_test_report.md', renderLoadReport()],
  ['reports/cost_report.md', renderCostReport()],
]);

let mismatch = false;
for (const [path, content] of outputs) {
  if (checkOnly) {
    const current = await readFile(path, 'utf8').catch(() => '');
    if (current !== content) {
      console.error(`${path} is not reproducible; regenerate Phase 5 reports`);
      mismatch = true;
    }
  } else {
    await writeFile(path, content, 'utf8');
    console.log(`generated ${path}`);
  }
}
if (mismatch) process.exit(1);
if (checkOnly) console.log('Phase 5 load and cost reports are reproducible');

function renderLoadReport() {
  const rows = loadResults
    .map(({ scenario, metrics }) =>
      [
        scenario.concurrency,
        scenario.warmup_iterations,
        metrics.measured_iterations,
        metrics.success_count,
        metrics.error_count,
        metrics.timeout_count,
        metrics.max_observed_concurrency,
        fixed(metrics.throughput_per_second),
        fixed(metrics.p50_latency_ms),
        fixed(metrics.p95_latency_ms),
        fixed(metrics.p99_latency_ms),
        percent(metrics.event_loop.utilization),
        fixed(metrics.event_loop.delay_p95_ms),
        fixed(metrics.event_loop.delay_max_ms),
      ].join(' | '),
    )
    .map((row) => `| ${row} |`)
    .join('\n');
  return `# Phase 5 Application Load Report

Generated: ${generatedAt}

> Deterministic in-process reference-fixture measurement. It does not measure HTTP, network, Chatwoot, provider, container, or production capacity.

## Workload Boundary

| Item | Value |
|------|------:|
| Workload | V3 selective pipeline with deterministic injected adapters |
| Dataset split | test |
| Workload items | 50 |
| Workload version | phase5-load-v1 |
| Measured iterations per scenario | 100 |
| Warmup iterations per scenario | 10 |
| Timeout | 1000 ms |
| Concurrency scenarios | 1 / 5 / 10 / 25 |

The harness executes the existing V3 application pipeline. The report fixture injects a deterministic monotonic clock and event-loop probe so report generation is byte-for-byte reproducible. Values validate scheduling, count, percentile, throughput, and reporting semantics; they are not wall-clock capacity claims.

## Scenario Results

| Concurrency | Warmup | Measured | Success | Error | Timeout | Peak Concurrency | Throughput/s | p50 ms | p95 ms | p99 ms | Event-loop Utilization | Event-loop Delay p95 ms | Event-loop Delay Max ms |
|------------:|-------:|---------:|--------:|------:|--------:|-----------------:|-------------:|-------:|-------:|-------:|-----------------------:|------------------------:|------------------------:|
${rows}

## Invariants

- Warmup results are excluded from measured counts and latency percentiles.
- Success, error, and timeout counts sum to measured iterations.
- Peak observed concurrency never exceeds the configured bound.
- A timeout aborts the invocation but retains its worker slot until the executor settles.
- One measured failure does not cancel unrelated iterations.
`;
}

function renderCostReport() {
  const v3 = comparison.runs.find(
    (run) => run.variant === 'v3_selective_pipeline',
  );
  if (v3 === undefined) throw new Error('missing V3 benchmark run');
  const rows = comparison.runs
    .map((run) => {
      const average = run.metrics.average_cost_per_ticket;
      const total = rounded(average * run.metrics.case_count);
      const averageDelta = rounded(
        v3.metrics.average_cost_per_ticket - average,
      );
      const relativeDelta =
        average === 0 ? 0 : rounded(averageDelta / average);
      return `| ${run.variant} | ${run.metrics.case_count} | ${money(average)} | ${money(total)} | ${money(tenantBudget.per_ticket)} | ${money(tenantBudget.per_ticket - average)} | ${money(tenantBudget.daily)} | ${money(tenantBudget.daily - total)} | ${signedMoney(averageDelta)} | ${signedPercent(relativeDelta)} |`;
    })
    .join('\n');
  return `# Phase 5 Cost Report

Generated: ${generatedAt}

> Deterministic reference-fixture cost comparison. Estimated execution cost is not provider billing and configured tenant budget is not measured spend.

## Budget Configuration

| Item | Value |
|------|------:|
| Currency | ${tenantBudget.currency} |
| Configured per-ticket budget | ${money(tenantBudget.per_ticket)} |
| Configured daily budget | ${money(tenantBudget.daily)} |
| Evaluated tickets per variant | ${comparison.case_count} |

## Measured Cost And Budget Headroom

| Variant | Tickets | Estimated Avg/Ticket | Estimated Total | Per-ticket Budget | Per-ticket Headroom | Daily Budget | Daily Headroom | V3 Avg Delta | V3 Relative Delta |
|---------|--------:|---------------------:|----------------:|------------------:|--------------------:|-------------:|---------------:|-------------:|------------------:|
${rows}

## Interpretation

- Estimated average and total costs come from normalized benchmark observations.
- Per-ticket and daily budgets are configured limits shown separately from measured estimates.
- Headroom is configured budget minus estimated cost; positive values remain within the reference budget.
- V3 deltas are \`v3_selective_pipeline - variant\`; negative cost deltas mean V3 is cheaper in this fixture.
- No live provider request or billing API is used.
`;
}

function fixed(value) {
  return value.toFixed(3);
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function signedPercent(value) {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function money(value) {
  return `$${value.toFixed(4)}`;
}

function signedMoney(value) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(4)}`;
}

function rounded(value) {
  return Number(value.toFixed(6));
}
