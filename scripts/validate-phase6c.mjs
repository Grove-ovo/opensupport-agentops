import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredFiles = [
  'apps/web/src/App.tsx',
  'apps/web/src/views/OverviewView.tsx',
  'apps/web/src/views/TracesView.tsx',
  'apps/web/src/views/ApprovalsView.tsx',
  'apps/web/src/views/ReleasesView.tsx',
  'apps/web/src/views/SettingsView.tsx',
  'apps/api/src/operations.ts',
  'apps/api/src/operations-routes.ts',
];

await Promise.all(requiredFiles.map((file) => readFile(file, 'utf8')));
const routes = await readFile('apps/api/src/operations-routes.ts', 'utf8');
const styles = await readFile('apps/web/src/styles.css', 'utf8');
assert.match(routes, /confirm: \{ const: true \}/);
assert.match(routes, /replacement_api_key/);
assert.match(styles, /@media \(max-width: 760px\)/);
assert.doesNotMatch(styles, /border-radius:\s*(?:[1-9]\d|[7-9])px/);
console.log('Phase 6C operations dashboard structure validated.');
