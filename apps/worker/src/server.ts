import { once } from 'node:events';
import { loadWorkerConfig } from './config.js';
import { createHealthServer } from './health.js';
import { createWorkerRuntime } from './runtime.js';

const config = loadWorkerConfig();
const runtime = await createWorkerRuntime(config);
const controller = new AbortController();
const health = createHealthServer(
  runtime.worker,
  runtime.metrics,
  config.buildVersion,
);
let closing = false;

health.listen(config.port, config.host);
const workerRun = runtime.worker.run(controller.signal);

async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  runtime.metrics.increment('agentops_worker_shutdown_total', { signal });
  runtime.worker.stop();
  controller.abort();
  const forced = setTimeout(() => {
    process.exitCode = 1;
  }, config.shutdownTimeoutMs);
  forced.unref();
  health.close();
  await Promise.allSettled([workerRun, once(health, 'close')]);
  await Promise.allSettled([
    runtime.repository.close(),
    runtime.queue.close(),
  ]);
  clearTimeout(forced);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

workerRun.catch(async () => {
  process.exitCode = 1;
  await shutdown('worker_failure');
});
