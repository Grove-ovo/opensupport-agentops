import { existsSync, readFileSync } from 'node:fs';

const required = [
  'packages/shared/src/release.ts',
  'packages/eval/src/release-candidate.ts',
  'packages/eval/src/release-candidate.test.ts',
  'infra/migrations/0011_release_candidates.sql',
  'infra/verification/phase4d_release_candidates.sql',
  'docs/release_gate.md',
  '.trellis/spec/infra/phase-4d-release-candidate-state-machine.md',
];
const failures = required
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 4D artifact: ${path}`);
const shared = read('packages/shared/src/release.ts');
const runtime = read('packages/eval/src/release-candidate.ts');
const migration = read('infra/migrations/0011_release_candidates.sql');
const verification = read(
  'infra/verification/phase4d_release_candidates.sql',
);
const pkg = read('package.json');

for (const value of [
  'ReleaseCandidateSnapshot',
  'ReleaseCandidateTransitionCommand',
  'ReleaseCandidateTransitionResult',
  'draft',
  'evaluating',
  'archived',
]) {
  if (!shared.includes(value)) {
    failures.push(`shared release contract must include ${value}`);
  }
}
for (const value of [
  'createReleaseCandidate',
  'applyReleaseCandidateTransition',
  'MemoryReleaseCandidateStateMachine',
  'eval_scope_mismatch',
  'idempotency_conflict',
]) {
  if (!runtime.includes(value)) {
    failures.push(`release candidate runtime must include ${value}`);
  }
}
for (const value of [
  'release_candidates',
  'release_candidate_transitions',
  'validate_release_candidate_eval_scope',
  'is_release_candidate_transition_allowed',
  'guard_release_candidate_mutation',
  'transition_release_candidate',
  'append-only',
]) {
  if (!migration.includes(value)) {
    failures.push(`release candidate migration must include ${value}`);
  }
}
for (const value of [
  'release snapshot mutation was not rejected',
  'direct release state mutation was not rejected',
  'release transition deletion was not rejected',
  'stale release transition was not rejected',
  'cross-tenant eval scope was not rejected',
]) {
  if (!verification.includes(value)) {
    failures.push(`live verification must include ${value}`);
  }
}
for (const value of [
  '0011_release_candidates.sql',
  'test:phase4d',
  'db:verify:release-candidate',
]) {
  if (!pkg.includes(value)) {
    failures.push(`package.json must include ${value}`);
  }
}
if (failures.length) {
  console.error('Phase 4D validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 4D validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
