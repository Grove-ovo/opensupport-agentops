import { existsSync, readFileSync } from 'node:fs';

const required = [
  'eval/eval_cases.jsonl',
  'eval/security_eval_cases.jsonl',
  'packages/shared/src/eval.ts',
  'packages/eval/src/dataset.ts',
  'packages/eval/src/dataset.test.ts',
  'infra/migrations/0010_eval_foundation.sql',
  'infra/verification/phase4a_eval_foundation.sql',
  'docs/eval_framework.md',
  '.trellis/spec/agent/phase-4a-eval-contracts-datasets.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 4A artifact: ${path}`);
const replay = rows('eval/eval_cases.jsonl');
const security = rows('eval/security_eval_cases.jsonl');
if (replay.length !== 150) {
  failures.push(`replay dataset must contain 150 rows, found ${replay.length}`);
}
if (security.length !== 40) {
  failures.push(
    `security dataset must contain 40 rows, found ${security.length}`,
  );
}
if (new Set(replay.map((row) => row.case_id)).size !== replay.length) {
  failures.push('replay case IDs must be unique');
}
if (new Set(security.map((row) => row.case_id)).size !== security.length) {
  failures.push('security case IDs must be unique');
}
const migration = read('infra/migrations/0010_eval_foundation.sql');
for (const table of [
  'eval_cases',
  'security_eval_cases',
  'eval_runs',
  'eval_case_results',
]) {
  if (!migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
    failures.push(`migration must create ${table}`);
  }
}
if (!read('package.json').includes('db:verify:eval')) {
  failures.push('package.json must include db:verify:eval');
}
if (failures.length) {
  console.error('Phase 4A validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 4A validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function rows(path) {
  return read(path)
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}
