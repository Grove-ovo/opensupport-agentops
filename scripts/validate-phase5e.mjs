import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/load.ts',
  'packages/eval/src/load.ts',
  'packages/eval/src/load.test.ts',
  '.trellis/spec/agent/phase-5e-application-load-harness.md',
  'docs/benchmark_framework.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 5E artifact: ${path}`);

const source = read('packages/eval/src/load.ts');
for (const value of [
  'ApplicationLoadHarness',
  'warmup_iterations',
  'max_observed_concurrency',
  'throughput_per_second',
  'p50_latency_ms',
  'p95_latency_ms',
  'p99_latency_ms',
  'eventLoopUtilization',
  'monitorEventLoopDelay',
  'warmup_failed',
  'idempotency_conflict',
]) {
  if (!source.includes(value)) {
    failures.push(`load harness must include ${value}`);
  }
}

const tests = read('packages/eval/src/load.test.ts');
for (const concurrency of ['1, 5, 10, 25', 'timeout', 'executor_error']) {
  if (!tests.includes(concurrency)) {
    failures.push(`load tests must cover ${concurrency}`);
  }
}

const packageJson = read('package.json');
if (!packageJson.includes('test:phase5e')) {
  failures.push('package scripts must include test:phase5e');
}

if (failures.length > 0) {
  console.error('Phase 5E validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 5E validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
