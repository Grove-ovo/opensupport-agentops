import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { ApiConfig } from './config.js';
import { createPostgresPool } from './database.js';
import { ProductionE2ERepository } from './e2e-repository.js';
import { HttpLLMProviderAdapter } from './provider.js';
import { NodeRedisCoordinator } from './redis.js';
import { PostgresAgentOpsStore } from './repositories.js';
import { EnvironmentSecretResolver } from './secrets.js';
import { ProductionTicketService } from './ticket-service.js';

export async function createRuntimeApp(config: ApiConfig): Promise<FastifyInstance> {
  const pool = createPostgresPool(config.databaseUrl);
  const store = new PostgresAgentOpsStore(pool);
  let redis: NodeRedisCoordinator | undefined;

  try {
    await store.ping();
    redis = await NodeRedisCoordinator.connect(config.redisUrl);
    await redis.ping();
    const e2eRepository = new ProductionE2ERepository(pool);
    const ticketService = new ProductionTicketService(
      store,
      e2eRepository,
      redis,
      new EnvironmentSecretResolver(),
      new HttpLLMProviderAdapter(config.providerBaseUrls),
      {
        masterKey: config.masterKey,
        pricingByModel: config.modelPricing,
        dedupeTtlSeconds: config.dedupeTtlSeconds,
        pipelineDeadlineMs: config.pipelineDeadlineMs,
        approvalTtlMs: config.approvalTtlMs,
      },
    );
    return buildApp(
      {
        store,
        redis,
        requiredMigration: config.requiredMigration,
        dedupeTtlSeconds: config.dedupeTtlSeconds,
        buildVersion: config.buildVersion,
        chatwootIngress: ticketService,
      },
      { logger: { level: config.logLevel } },
    );
  } catch (error) {
    await Promise.allSettled([store.close(), redis?.close()]);
    throw error;
  }
}
