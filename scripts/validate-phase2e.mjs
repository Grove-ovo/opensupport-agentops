import { existsSync, readFileSync } from 'node:fs';

const requiredPaths = [
  'packages/shared/src/tools.ts',
  'packages/tools/src/manifests.ts',
  'packages/tools/src/executor.ts',
  'packages/tools/src/repository.ts',
  'packages/tools/src/tools.test.ts',
  'docs/tool_contract.md',
  '.trellis/spec/agent/phase-2e-tool-contracts.md',
];
const failures = [];
for (const path of requiredPaths) {
  if (!existsSync(path)) failures.push(`missing Phase 2E artifact: ${path}`);
}
const manifests = read('packages/tools/src/manifests.ts');
const executor = read('packages/tools/src/executor.ts');
const pkg = read('package.json');
for (const name of [
  'get_order_status',
  'get_logistics_status',
  'check_refund_eligibility',
  'create_refund_request_dry_run',
  'escalate_to_human',
]) {
  if (!manifests.includes(name)) failures.push(`manifest must include ${name}`);
}
for (const code of [
  'invalid_schema',
  'unauthorized_order',
  'timed_out',
  'retryable_error',
  'duplicate_request',
  'idempotency_conflict',
]) {
  if (!executor.includes(code)) failures.push(`executor must include ${code}`);
}
for (const value of ['test:phase2e', 'test:tools']) {
  if (!pkg.includes(value)) failures.push(`package.json must include ${value}`);
}
if (failures.length) {
  console.error('Phase 2E validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 2E validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
