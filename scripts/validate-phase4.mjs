import { existsSync, readFileSync } from 'node:fs';

const parentSlug = '06-19-phase-4-eval-release-gate';
const children = [
  '06-19-phase-4a-eval-contracts-datasets',
  '06-19-phase-4b-replay-eval-runner-metrics',
  '06-19-phase-4c-security-eval-runner',
  '06-19-phase-4d-release-candidate-state-machine',
  '06-19-phase-4e-release-gate-promotion',
  '06-19-phase-4f-failure-buckets-reports-integration',
];
const requiredArtifacts = [
  'eval/eval_cases.jsonl',
  'eval/security_eval_cases.jsonl',
  'docs/eval_framework.md',
  'docs/release_gate.md',
  'docs/failure_buckets.md',
  'reports/eval_report.md',
  'reports/security_eval_report.md',
  'reports/failure_analysis.md',
  'packages/eval/src/replay.ts',
  'packages/eval/src/security.ts',
  'packages/eval/src/release-candidate.ts',
  'packages/eval/src/release-gate.ts',
  'packages/eval/src/failure.ts',
  'infra/migrations/0010_eval_foundation.sql',
  'infra/migrations/0011_release_candidates.sql',
  'infra/migrations/0012_release_gate_results.sql',
  'infra/migrations/0013_failure_cases.sql',
];
const failures = requiredArtifacts
  .filter((path) => !existsSync(path))
  .map((path) => `missing Phase 4 artifact: ${path}`);

const parentPath = resolveTask(parentSlug);
const parent = readJson(parentPath);
if (parentPath === null) failures.push('missing Phase 4 parent task');
if (JSON.stringify(parent?.children) !== JSON.stringify(children)) {
  failures.push('Phase 4 parent must retain children in dependency order');
}
if (!['planning', 'in_progress', 'completed'].includes(parent?.status)) {
  failures.push('Phase 4 parent has an invalid status');
}

for (const [index, child] of children.entries()) {
  const taskPath = resolveTask(child);
  if (taskPath === null) {
    failures.push(`missing Phase 4 child task: ${child}`);
    continue;
  }
  const task = readJson(taskPath);
  const isFinalChild = index === children.length - 1;
  const allowed =
    isFinalChild && parent?.status === 'planning'
      ? ['in_progress', 'completed']
      : ['completed'];
  if (!allowed.includes(task?.status)) {
    failures.push(`${child} must have status ${allowed.join(' or ')}`);
  }
  if (task?.parent !== parentSlug) {
    failures.push(`${child} must remain linked to the Phase 4 parent`);
  }
}

const parentPrd = read(
  parentPath === null ? '' : parentPath.replace(/task\.json$/u, 'prd.md'),
);
for (const value of [
  'AC-1:',
  'AC-3:',
  'AC-4:',
  'AC-6:',
  'AC-7:',
  'AC-9:',
  'AC-10:',
]) {
  if (!parentPrd.includes(value)) {
    failures.push(`Phase 4 parent PRD must retain ${value}`);
  }
}

const evalReport = read('reports/eval_report.md');
const securityReport = read('reports/security_eval_report.md');
const failureReport = read('reports/failure_analysis.md');
for (const value of [
  'Total committed cases | 150',
  'Task success delta',
  'Promotion state',
]) {
  if (!evalReport.includes(value)) {
    failures.push(`eval report must include ${value}`);
  }
}
for (const value of [
  'Total committed cases | 40',
  'P0 pass rate',
  'Unauthorized access rate',
]) {
  if (!securityReport.includes(value)) {
    failures.push(`security report must include ${value}`);
  }
}
for (const value of [
  'Failure Buckets',
  'Reason Codes',
  'provider payloads are excluded',
]) {
  if (!failureReport.includes(value)) {
    failures.push(`failure report must include ${value}`);
  }
}

if (failures.length) {
  console.error('Phase 4 integration validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 4 integration validation passed');

function resolveTask(slug) {
  const active = `.trellis/tasks/${slug}/task.json`;
  const archived = `.trellis/tasks/archive/2026-06/${slug}/task.json`;
  if (existsSync(active)) return active;
  if (existsSync(archived)) return archived;
  return null;
}

function readJson(path) {
  if (path === null || !existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function read(path) {
  return path && existsSync(path) ? readFileSync(path, 'utf8') : '';
}
