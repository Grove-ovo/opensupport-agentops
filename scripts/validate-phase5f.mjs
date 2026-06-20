import { existsSync, readFileSync } from 'node:fs';

const required = [
  'scripts/phase5-report-fixtures.mjs',
  'scripts/generate-phase5-reports.mjs',
  'scripts/validate-phase5.mjs',
  'reports/benchmark_report.md',
  'reports/load_test_report.md',
  'reports/cost_report.md',
  '.trellis/spec/agent/phase-5f-reports-integration.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 5F artifact: ${path}`);

const loadReport = read('reports/load_test_report.md');
for (const value of [
  'Concurrency scenarios | 1 / 5 / 10 / 25',
  'Throughput/s',
  'p50 ms',
  'p95 ms',
  'p99 ms',
  'Event-loop Utilization',
  'Event-loop Delay p95 ms',
  'Deterministic in-process reference-fixture measurement',
]) {
  if (!loadReport.includes(value)) {
    failures.push(`load report must include ${value}`);
  }
}

const costReport = read('reports/cost_report.md');
for (const value of [
  'Estimated Avg/Ticket',
  'Estimated Total',
  'Per-ticket Budget',
  'Per-ticket Headroom',
  'Daily Budget',
  'Daily Headroom',
  'V3 Relative Delta',
  'configured tenant budget is not measured spend',
]) {
  if (!costReport.includes(value)) {
    failures.push(`cost report must include ${value}`);
  }
}

const packageJson = read('package.json');
for (const command of [
  'reports:phase5',
  'reports:phase5:check',
  'test:phase5f',
  'test:phase5',
]) {
  if (!packageJson.includes(command)) {
    failures.push(`package scripts must include ${command}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 5F validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 5F validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
