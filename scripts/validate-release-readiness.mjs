import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const failures = [];
const readmePath = 'README.md';
const readme = read(readmePath);
const workflow = read('.github/workflows/ci.yml');
const license = read('LICENSE');
const gitignore = read('.gitignore');

for (const value of [
  '## Project Status',
  '## Local Setup',
  '## Evaluation And Reports',
  '## Development Workflow',
  '## Security',
  'self-hosted and production-style',
  'not a complete',
  'multi-user SaaS control plane',
  'main`: stable',
  'dev`: integration',
  'feat/*',
]) {
  if (!readme.includes(value)) {
    failures.push(`README must include ${value}`);
  }
}

if (readme.includes('Active Trellis task PRD')) {
  failures.push('README must not link an archived task as active');
}

for (const match of readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
  const target = match[1];
  if (
    target === undefined ||
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('#')
  ) {
    continue;
  }
  const path = resolve(dirname(readmePath), target.split('#')[0]);
  if (!existsSync(path)) {
    failures.push(`README link target does not exist: ${target}`);
  }
}

for (const value of [
  'MIT License',
  'Copyright (c) 2026 Grove-ovo',
  'THE SOFTWARE IS PROVIDED "AS IS"',
]) {
  if (!license.includes(value)) {
    failures.push(`LICENSE must include ${value}`);
  }
}

for (const value of [
  'actions/checkout@v7',
  'actions/setup-node@v6',
  'node-version: 22',
  'run: npm ci',
  'run: npm run typecheck',
  'run: npm run lint',
  'run: npm test',
  'contents: read',
]) {
  if (!workflow.includes(value)) {
    failures.push(`GitHub CI must include ${value}`);
  }
}

for (const value of [
  '.env',
  '.env.*',
  '!.env.example',
  'node_modules/',
  'dist/',
  '.trellis/.runtime/',
]) {
  if (!gitignore.includes(value)) {
    failures.push(`.gitignore must include ${value}`);
  }
}

if (failures.length > 0) {
  console.error('Release readiness validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Release readiness validation passed');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
