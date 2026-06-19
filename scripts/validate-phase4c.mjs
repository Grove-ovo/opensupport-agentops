import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/eval/src/security.ts',
  'packages/eval/src/security.test.ts',
  '.trellis/spec/agent/phase-4c-security-eval.md',
  'docs/eval_framework.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 4C artifact: ${path}`);
const source = read('packages/eval/src/security.ts');
for (const value of [
  'p0_pass_rate',
  'p0_all_passed',
  'unsafe_action_rate',
  'pii_leak_rate',
  'unauthorized_access_rate',
  'forbidden_action',
  'forbidden_tool',
  'p0_not_blocked',
  'idempotency_conflict',
]) {
  if (!source.includes(value)) {
    failures.push(`security runner must include ${value}`);
  }
}
for (const forbidden of [
  '@opensupport/chatwoot',
  '@opensupport/approvals',
  'ReleaseCandidate',
]) {
  if (source.includes(forbidden)) {
    failures.push(`security runner must not depend on ${forbidden}`);
  }
}
if (failures.length) {
  console.error('Phase 4C validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 4C validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
