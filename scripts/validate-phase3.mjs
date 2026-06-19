import { existsSync, readFileSync } from 'node:fs';

const parentSlug = '06-19-phase-3-runtime-modes-approval';
const children = [
  '06-19-phase-3a-execution-state-machine',
  '06-19-phase-3b-runtime-mode-decision',
  '06-19-phase-3c-chatwoot-runtime-delivery',
  '06-19-phase-3d-approval-snapshot-persistence',
  '06-19-phase-3e-approval-actions-edit-tracking',
  '06-19-phase-3f-runtime-approval-integration',
];
const requiredArtifacts = [
  'docs/runtime_modes.md',
  'docs/approval_flow.md',
  'packages/runtime-control/src/transition.ts',
  'packages/runtime-control/src/mode-decision.ts',
  'packages/chatwoot/src/delivery.ts',
  'packages/approvals/src/snapshot.ts',
  'packages/approvals/src/actions.ts',
  'packages/runtime-orchestrator/src/orchestrator.ts',
  'infra/migrations/0006_ticket_execution_state_machine.sql',
  'infra/migrations/0007_runtime_mode_decisions.sql',
  'infra/migrations/0008_approval_snapshots.sql',
  'infra/migrations/0009_approval_actions.sql',
];
const failures = [];
for (const path of requiredArtifacts) {
  if (!existsSync(path)) failures.push(`missing Phase 3 artifact: ${path}`);
}

const parentPath = resolveTask(parentSlug);
const parent = readJson(parentPath);
if (parentPath === null) failures.push('missing Phase 3 parent task');
if (JSON.stringify(parent?.children) !== JSON.stringify(children)) {
  failures.push('Phase 3 parent must retain children in dependency order');
}
if (!['planning', 'in_progress', 'completed'].includes(parent?.status)) {
  failures.push('Phase 3 parent has an invalid status');
}

for (const [index, child] of children.entries()) {
  const taskPath = resolveTask(child);
  if (taskPath === null) {
    failures.push(`missing Phase 3 child task: ${child}`);
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
    failures.push(`${child} must remain linked to the Phase 3 parent`);
  }
}

const parentPrd = read(
  parentPath === null
    ? ''
    : parentPath.replace(/task\.json$/, 'prd.md'),
);
for (const value of [
  'AC-2: Shadow',
  'AC-3: Assist',
  'AC-4: Approve/edit',
  'AC-5: Auto',
  'AC-6: P0 risk',
  'AC-7: Duplicate runtime',
  'AC-8: Human edits',
  'AC-9: Every delivery',
  'AC-10: Phase 3A through Phase 3F',
]) {
  if (!parentPrd.includes(value)) {
    failures.push(`Phase 3 parent PRD must retain ${value}`);
  }
}

if (failures.length) {
  console.error('Phase 3 integration validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 3 integration validation passed');

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
