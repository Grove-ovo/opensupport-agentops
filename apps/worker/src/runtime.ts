import { PostgresJobRepository } from './repository.js';
import { RedisStreamQueue } from './redis-streams.js';
import { MetricsRegistry } from './metrics.js';
import { AsyncMonitorWorker } from './worker.js';
import type { WorkerConfig } from './config.js';
import { createStructuredLog } from './structured-log.js';

export async function createWorkerRuntime(config: WorkerConfig) {
  const repository = new PostgresJobRepository(config.databaseUrl);
  let queue: RedisStreamQueue | null = null;
  try {
    await repository.ping();
    queue = await RedisStreamQueue.connect(
      config.redisUrl,
      config.streamKey,
      config.groupName,
      config.deadLetterStream,
    );
    const metrics = new MetricsRegistry();
    const structuredLog = createStructuredLog(config.buildVersion);
    const worker = new AsyncMonitorWorker(
      repository,
      queue,
      metrics,
      config,
      structuredLog,
    );
    await worker.initialize();
    return { worker, repository, queue, metrics };
  } catch (error) {
    await Promise.allSettled([repository.close(), queue?.close()]);
    throw error;
  }
}
