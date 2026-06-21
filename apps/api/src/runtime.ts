import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { ApiConfig } from './config.js';
import { createPostgresPool } from './database.js';
import { NodeRedisCoordinator } from './redis.js';
import { PostgresAgentOpsStore } from './repositories.js';

export async function createRuntimeApp(config: ApiConfig): Promise<FastifyInstance> {
  const pool = createPostgresPool(config.databaseUrl);
  const store = new PostgresAgentOpsStore(pool);
  let redis: NodeRedisCoordinator | undefined;

  try {
    await store.ping();
    redis = await NodeRedisCoordinator.connect(config.redisUrl);
    await redis.ping();
    return buildApp(
      {
        store,
        redis,
        requiredMigration: config.requiredMigration,
        dedupeTtlSeconds: config.dedupeTtlSeconds,
        buildVersion: config.buildVersion,
      },
      { logger: { level: config.logLevel } },
    );
  } catch (error) {
    await Promise.allSettled([store.close(), redis?.close()]);
    throw error;
  }
}
