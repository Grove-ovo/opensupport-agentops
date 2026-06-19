import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/runtime-orchestrator/src/orchestrator.ts',
  'packages/runtime-orchestrator/src/orchestrator.test.ts',
  'packages/runtime-orchestrator/src/types.ts',
  '.trellis/spec/agent/phase-3f-runtime-orchestration.md',
  'docs/runtime_modes.md',
  'docs/approval_flow.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 3F artifact: ${path}`);
const orchestrator = read('packages/runtime-orchestrator/src/orchestrator.ts');
const tests = read('packages/runtime-orchestrator/src/orchestrator.test.ts');
const packageJson = JSON.parse(read('package.json'));

for (const value of [
  'private_note',
  'create_approval',
  'public_reply',
  'handoff',
  'RuntimeExecutionAudit',
  'idempotency_conflict',
  'delivery_failed',
]) {
  if (!orchestrator.includes(value)) {
    failures.push(`runtime orchestrator must include ${value}`);
  }
}
for (const value of [
  'Shadow writes one private note',
  'Assist creates one immutable approval',
  'Auto sends one low-risk grounded public reply',
  'concurrent duplicate Auto execution',
  'different execution keys cannot concurrently claim the same trace',
  'stale expected state is rejected before any side effect',
  'P0 risk and missing grounding',
  'ticket cost cap downgrades Auto',
  'high-risk tool work requires approval',
  'approved Assist result',
  'rejected Assist result',
]) {
  if (!tests.includes(value)) {
    failures.push(`runtime integration tests must include ${value}`);
  }
}
for (const script of [
  'test:runtime-orchestrator',
  'test:phase3f',
  'test:phase3',
]) {
  if (!(script in packageJson.scripts)) {
    failures.push(`package.json must include ${script}`);
  }
}
if (orchestrator.includes('validation-placeholder')) {
  failures.push('runtime orchestrator contains an unfinished placeholder import');
}
if (failures.length) {
  console.error('Phase 3F validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 3F validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
