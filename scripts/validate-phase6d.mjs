import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  'apps/worker/src/worker.ts',
  'apps/worker/src/redis-streams.ts',
  'apps/worker/src/repository.ts',
  'apps/worker/src/server.ts',
  'infra/migrations/0016_async_monitor_worker.sql',
  'infra/verification/phase6d_async_monitor_worker.sql',
  'docs/async_monitor_worker.md',
];
await Promise.all(files.map((file) => readFile(file, 'utf8')));
const migration = await readFile(
  'infra/migrations/0016_async_monitor_worker.sql',
  'utf8',
);
const queue = await readFile('apps/worker/src/redis-streams.ts', 'utf8');
const worker = await readFile('apps/worker/src/worker.ts', 'utf8');
assert.match(migration, /runtime_execution_enqueue_async/);
assert.match(migration, /release_gate_enqueue_materialization/);
assert.match(queue, /XAUTOCLAIM/);
assert.match(queue, /agentops:stream-dead/);
assert.match(worker, /markJobFailure/);
assert.match(worker, /await this\.queue\.ack/);
console.log('Phase 6D asynchronous monitor worker structure validated.');
