import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';

const parentSlug = '06-20-phase-5-benchmark-load-test';
const childSlugs = [
  '06-20-phase-5a-benchmark-contracts-metrics',
  '06-20-phase-5b-super-agent-rag-only-adapters',
  '06-20-phase-5c-rag-tools-selective-adapters',
  '06-20-phase-5d-comparative-benchmark-report',
  '06-20-phase-5e-application-load-harness',
  '06-20-phase-5f-cost-report-integration',
];
const finalMode = process.argv.includes('--final');
const failures = [];
const parentPath = resolveTask(parentSlug);
const parent = parentPath === null ? null : readJson(parentPath);

if (parent === null) {
  failures.push(`missing Phase 5 parent task: ${parentSlug}`);
} else if (
  JSON.stringify(parent.children) !== JSON.stringify(childSlugs)
) {
  failures.push('Phase 5 parent must link all six children in dependency order');
}

for (const slug of childSlugs) {
  const taskPath = resolveTask(slug);
  if (taskPath === null) {
    failures.push(`missing Phase 5 child task: ${slug}`);
    continue;
  }
  const task = readJson(taskPath);
  if (task?.parent !== parentSlug) {
    failures.push(`${slug} must reference parent ${parentSlug}`);
  }
  const allowedActive =
    !finalMode &&
    slug === '06-20-phase-5f-cost-report-integration' &&
    task?.status === 'in_progress';
  if (task?.status !== 'completed' && !allowedActive) {
    failures.push(`${slug} must be completed${finalMode ? '' : ' or current 5F'}`);
  }
}

for (const path of [
  'reports/benchmark_report.md',
  'reports/load_test_report.md',
  'reports/cost_report.md',
]) {
  if (!existsSync(path)) failures.push(`missing Phase 5 report: ${path}`);
}

const packageJson = read('package.json');
for (const command of [
  'test:phase5a',
  'test:phase5b',
  'test:phase5c',
  'test:phase5d',
  'test:phase5e',
  'test:phase5f',
]) {
  if (!packageJson.includes(command)) {
    failures.push(`missing independently executable command ${command}`);
  }
}

if (failures.length > 0) {
  console.error('Phase 5 integration validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(
  `Phase 5 integration validation passed${finalMode ? ' (final)' : ''}`,
);

function resolveTask(slug) {
  const active = `.trellis/tasks/${slug}/task.json`;
  if (existsSync(active)) return active;
  return findFile('.trellis/tasks/archive', slug);
}

function findFile(directory, slug) {
  if (!existsSync(directory)) return null;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === slug) {
        const taskPath = join(path, 'task.json');
        if (existsSync(taskPath)) return taskPath;
      }
      const nested = findFile(path, slug);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}
