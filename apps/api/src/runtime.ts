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
import { PostgresOperationsService } from './operations.js';
import { createStructuredLog } from './structured-log.js';
import { OidcOperatorAccess } from './operator-auth.js';

export async function createRuntimeApp(config: ApiConfig): Promise<FastifyInstance> {
  const pool = createPostgresPool(config.databaseUrl);
  const store = new PostgresAgentOpsStore(pool);
  let redis: NodeRedisCoordinator | undefined;

  try {
    await store.ping();
    redis = await NodeRedisCoordinator.connect(config.redisUrl);
    await redis.ping();
    const e2eRepository = new ProductionE2ERepository(pool);
    const secrets = new EnvironmentSecretResolver();
    const structuredLog = createStructuredLog(config.buildVersion);
    const ticketService = new ProductionTicketService(
      store,
      e2eRepository,
      redis,
      secrets,
      new HttpLLMProviderAdapter(config.providerBaseUrls),
      {
        masterKey: config.masterKey,
        pricingByModel: config.modelPricing,
        dedupeTtlSeconds: config.dedupeTtlSeconds,
        pipelineDeadlineMs: config.pipelineDeadlineMs,
        approvalTtlMs: config.approvalTtlMs,
        log: structuredLog,
      },
    );
    return buildApp(
      {
        store,
        redis,
        requiredMigration: config.requiredMigration,
        dedupeTtlSeconds: config.dedupeTtlSeconds,
        buildVersion: config.buildVersion,
        operatorAccess: new OidcOperatorAccess(config.operatorAuth),
        chatwootIngress: ticketService,
        operations: new PostgresOperationsService(
          pool,
          secrets,
          config.masterKey,
          config.masterKeyId,
        ),
      },
      {
        logger: {
          level: config.logLevel,
          base: {
            service: 'api',
            build_version: config.buildVersion,
          },
        },
      },
    );
  } catch (error) {
    await Promise.allSettled([store.close(), redis?.close()]);
    throw error;
  }
}
