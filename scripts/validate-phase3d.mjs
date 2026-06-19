import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/approval.ts',
  'packages/approvals/src/snapshot.ts',
  'packages/approvals/src/snapshot.test.ts',
  'infra/migrations/0008_approval_snapshots.sql',
  'infra/verification/phase3d_approval_snapshots.sql',
  'docs/approval_flow.md',
  '.trellis/spec/infra/phase-3d-approval-snapshots.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 3D artifact: ${path}`);
const migration = read('infra/migrations/0008_approval_snapshots.sql');
const service = read('packages/approvals/src/snapshot.ts');
for (const value of [
  'approval_requests',
  'prevent_approval_snapshot_mutation',
  'create_pending_approval',
  'transition_ticket_execution',
]) {
  if (!migration.includes(value)) failures.push(`migration must include ${value}`);
}
for (const value of [
  'MemoryApprovalRepository',
  'waiting_approval',
  'active_approval_conflict',
  'input_hash',
]) {
  if (!service.includes(value)) failures.push(`approval service must include ${value}`);
}
if (failures.length) {
  console.error('Phase 3D validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 3D validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
