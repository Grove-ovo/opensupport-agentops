import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/failure.ts',
  'packages/eval/src/failure.ts',
  'packages/eval/src/failure.test.ts',
  'infra/migrations/0013_failure_cases.sql',
  'infra/verification/phase4f_failure_cases.sql',
  'scripts/generate-phase4-reports.mjs',
  'reports/eval_report.md',
  'reports/security_eval_report.md',
  'reports/failure_analysis.md',
  'docs/failure_buckets.md',
  '.trellis/spec/agent/phase-4f-failure-buckets-reports.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 4F artifact: ${path}`);
const shared = read('packages/shared/src/failure.ts');
const runtime = read('packages/eval/src/failure.ts');
const migration = read('infra/migrations/0013_failure_cases.sql');
const verification = read('infra/verification/phase4f_failure_cases.sql');
const pkg = read('package.json');

for (const value of [
  'security',
  'grounding',
  'retrieval',
  'tool',
  'risk',
  'latency',
  'cost',
  'regression',
  'quality',
  'infrastructure',
]) {
  if (!shared.includes(`'${value}'`)) {
    failures.push(`failure contract must include bucket ${value}`);
  }
}
for (const value of [
  'materializeFailureCases',
  'classifyFailureBucket',
  'scope_mismatch',
  'deterministicUuid',
]) {
  if (!runtime.includes(value)) {
    failures.push(`failure materializer must include ${value}`);
  }
}
for (const forbidden of [
  'masked_input:',
  'suggested_reply:',
  'evidence_refs:',
  'tool_result_refs:',
  'api_key:',
  'provider_payload:',
]) {
  if (shared.includes(forbidden)) {
    failures.push(`FailureCase must not include ${forbidden}`);
  }
}
for (const value of [
  'failure_cases',
  'source_type',
  'prevent_failure_case_mutation',
  'append-only',
  'source payloads are excluded',
]) {
  if (!migration.includes(value)) {
    failures.push(`failure migration must include ${value}`);
  }
}
for (const value of [
  'failure case mutation was not rejected',
  'failure case deletion was not rejected',
  'invalid failure source shape was not rejected',
  'cross-tenant failure references were not rejected',
]) {
  if (!verification.includes(value)) {
    failures.push(`failure verification must include ${value}`);
  }
}
for (const value of [
  '0013_failure_cases.sql',
  'reports:phase4:check',
  'test:phase4f',
  'db:verify:failure-cases',
]) {
  if (!pkg.includes(value)) {
    failures.push(`package.json must include ${value}`);
  }
}
if (failures.length) {
  console.error('Phase 4F validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 4F validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
