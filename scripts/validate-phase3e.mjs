import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/approvals/src/actions.ts',
  'packages/approvals/src/actions.test.ts',
  'infra/migrations/0009_approval_actions.sql',
  'infra/verification/phase3e_approval_actions.sql',
  '.trellis/spec/infra/phase-3e-approval-actions.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 3E artifact: ${path}`);
const actions = read('packages/approvals/src/actions.ts');
const migration = read('infra/migrations/0009_approval_actions.sql');
for (const value of [
  'approve',
  'edit',
  'reject',
  'escalate',
  'expire',
  'normalizedEditDistance',
  'delivery_failed',
]) {
  if (!actions.includes(value)) failures.push(`approval actions must include ${value}`);
}
for (const value of [
  'approval_action_records',
  'normalized_approval_edit_distance',
  'guard_approval_action_transition',
  'apply_approval_action',
]) {
  if (!migration.includes(value)) failures.push(`migration must include ${value}`);
}
if (failures.length) {
  console.error('Phase 3E validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 3E validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
