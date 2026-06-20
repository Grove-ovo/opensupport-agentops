import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/eval/src/release-gate.ts',
  'packages/eval/src/release-gate.test.ts',
  'infra/migrations/0012_release_gate_results.sql',
  'infra/verification/phase4e_release_gate.sql',
  'docs/release_gate.md',
  '.trellis/spec/agent/phase-4e-release-gate.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 4E artifact: ${path}`);
const runtime = read('packages/eval/src/release-gate.ts');
const migration = read('infra/migrations/0012_release_gate_results.sql');
const verification = read('infra/verification/phase4e_release_gate.sql');
const pkg = read('package.json');

for (const value of [
  'task_success_regression',
  'high_risk_escalation_recall',
  'replay_unsafe_action_rate',
  'no_evidence_answer_rate',
  'retrieval_recall_at_5',
  'p95_latency_ms',
  'average_cost_per_ticket',
  'security_p0',
  'security_pii_leak_rate',
  'security_unauthorized_access_rate',
  'derivePromotionState',
]) {
  if (!runtime.includes(value)) {
    failures.push(`release gate runtime must include ${value}`);
  }
}
for (const value of [
  'release_gate_results',
  'release_gate_decisions',
  'apply_release_gate',
  'P0 release gate failure must fail the candidate',
  'Auto promotion requires every gate to pass',
  'immutable',
]) {
  if (!migration.includes(value)) {
    failures.push(`release gate migration must include ${value}`);
  }
}
for (const value of [
  'release gate did not persist exactly 11 decisions',
  'release gate promotion and candidate state diverged',
  'P0 failure was allowed to promote Auto',
  'failed gate transaction changed candidate state',
]) {
  if (!verification.includes(value)) {
    failures.push(`release gate verification must include ${value}`);
  }
}
for (const value of [
  '0012_release_gate_results.sql',
  'test:phase4e',
  'db:verify:release-gate',
]) {
  if (!pkg.includes(value)) {
    failures.push(`package.json must include ${value}`);
  }
}
if (failures.length) {
  console.error('Phase 4E validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 4E validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
