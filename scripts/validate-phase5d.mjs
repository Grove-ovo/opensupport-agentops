import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/eval/src/comparison.ts',
  'packages/eval/src/comparison.test.ts',
  'scripts/generate-phase5-benchmark-report.mjs',
  'reports/benchmark_report.md',
  '.trellis/spec/agent/phase-5d-comparative-benchmark.md',
  'docs/benchmark_framework.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 5D artifact: ${path}`);

const source = read('packages/eval/src/comparison.ts');
for (const value of [
  'compareBenchmarkRuns',
  'missing_variant',
  'duplicate_variant',
  'scope_mismatch',
  'unsafe_action_rate',
  'v3_selective_pipeline',
]) {
  if (!source.includes(value)) {
    failures.push(`benchmark comparison must include ${value}`);
  }
}

const report = read('reports/benchmark_report.md');
for (const value of [
  'Deterministic reference-fixture architecture comparison',
  'v0_super_agent',
  'v1_rag_only',
  'v2_rag_tools',
  'v3_selective_pipeline',
  'V3 Pairwise Deltas',
  'Safety-first Ranking',
  'Scope hash',
]) {
  if (!report.includes(value)) {
    failures.push(`benchmark report must include ${value}`);
  }
}

const packageJson = read('package.json');
for (const command of [
  'reports:phase5:benchmark',
  'reports:phase5:benchmark:check',
  'test:phase5d',
]) {
  if (!packageJson.includes(command)) {
    failures.push(`package scripts must include ${command}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 5D validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 5D validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
