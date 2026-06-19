import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/runtime-mode.ts',
  'packages/runtime-control/src/mode-decision.ts',
  'packages/runtime-control/src/mode-decision.test.ts',
  'infra/migrations/0007_runtime_mode_decisions.sql',
  'infra/verification/phase3b_runtime_mode_decisions.sql',
  '.trellis/spec/infra/phase-3b-runtime-mode-decision.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 3B artifact: ${path}`);
const runtime = read('packages/runtime-control/src/mode-decision.ts');
const migration = read('infra/migrations/0007_runtime_mode_decisions.sql');
const pkg = read('package.json');
for (const value of [
  'decideRuntimeMode',
  'daily_budget_exceeded',
  'ticket_budget_exceeded',
  'latency_exceeded',
  'intent_not_auto_allowed',
  'grounding_missing',
]) {
  if (!runtime.includes(value)) failures.push(`decision engine must include ${value}`);
}
for (const value of [
  'runtime_mode_configs',
  'runtime_mode_decisions',
  'prevent_runtime_mode_config_mutation',
  'runtime_mode_decisions_append_only',
]) {
  if (!migration.includes(value)) failures.push(`migration must include ${value}`);
}
for (const value of [
  'test:phase3b',
  'db:verify:runtime-mode',
  '0007_runtime_mode_decisions.sql',
]) {
  if (!pkg.includes(value)) failures.push(`package.json must include ${value}`);
}
for (const forbidden of ['@opensupport/chatwoot', 'approval_requests']) {
  if (runtime.includes(forbidden)) failures.push(`Phase 3B must not include ${forbidden}`);
}
if (failures.length) {
  console.error('Phase 3B validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 3B validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
