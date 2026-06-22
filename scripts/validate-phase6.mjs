import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const archivedTaskRoot = '.trellis/tasks/archive/2026-06';
const childTasks = [
  '06-20-phase-6a-api-postgres-redis',
  '06-20-phase-6b-chatwoot-llm-e2e',
  '06-20-phase-6c-operations-dashboard',
  '06-20-phase-6d-async-monitor-worker',
  '06-20-phase-6e-production-operations',
];

for (const child of childTasks) {
  const task = JSON.parse(
    await readFile(`${archivedTaskRoot}/${child}/task.json`, 'utf8'),
  );
  assert.equal(task.status, 'completed', `${child} must be archived completed`);
}

const requiredFiles = [
  'apps/api/src/server.ts',
  'apps/web/src/App.tsx',
  'apps/worker/src/server.ts',
  'infra/migrations/0016_async_monitor_worker.sql',
  'infra/docker/compose.production.yml',
  'infra/observability/prometheus.yml',
  'docs/operations/deployment-runbook.md',
  'scripts/production-smoke.mjs',
];
await Promise.all(requiredFiles.map((file) => readFile(file, 'utf8')));

const parentPrd = await readFile(
  '.trellis/tasks/06-20-phase-6-productization-real-e2e/prd.md',
  'utf8',
);
const readme = await readFile('README.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

assert.doesNotMatch(parentPrd, /reserved but empty/);
assert.doesNotMatch(parentPrd, /migrations through `0013`/);
assert.match(readme, /production-oriented Phase 6/);
assert.match(packageJson.scripts.test, /test:phase6e/);
assert.equal(packageJson.scripts['test:phase6'], 'node scripts/validate-phase6.mjs');

console.log('Phase 6 productization and real E2E validation passed.');
