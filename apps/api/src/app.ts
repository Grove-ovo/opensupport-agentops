import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';
import type {
  ApprovalState,
  ReleaseCandidateState,
} from '@opensupport/shared';
import type {
  AppDependencies,
  PageQuery,
  ReadinessStatus,
} from './contracts.js';
import { registerChatwootRoutes } from './chatwoot-routes.js';
import { registerOperationsRoutes } from './operations-routes.js';
import { MetricsRegistry } from './metrics.js';

const APPROVAL_STATES = new Set<ApprovalState>([
  'pending',
  'approved',
  'edited',
  'rejected',
  'escalated',
  'expired',
]);
const RELEASE_STATES = new Set<ReleaseCandidateState>([
  'draft',
  'evaluating',
  'failed',
  'shadow',
  'assist',
  'auto',
  'archived',
]);
const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export interface BuildAppOptions {
  logger?: boolean | { level: string };
}

export function buildApp(
  dependencies: AppDependencies,
  options: BuildAppOptions = {},
): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    genReqId: (request) => headerValue(request.headers['x-request-id']) ?? randomUUID(),
    disableRequestLogging: false,
  });
  const metrics = new MetricsRegistry();
  metrics.gauge('agentops_info', 1, {
    service: 'api',
    version: dependencies.buildVersion,
  });

  app.addHook('onResponse', async (request, reply) => {
    metrics.increment('agentops_http_requests_total', {
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched',
      status: String(reply.statusCode),
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const validation = hasValidation(error);
    const statusCode = validation ? 400 : getStatusCode(error);
    request.log.error({ err: error, request_id: request.id }, 'request failed');
    void reply.status(statusCode).send({
      error: {
        code: validation ? 'invalid_request' : statusCode === 404 ? 'not_found' : 'internal_error',
        message: validation ? 'Request validation failed' : statusCode === 404 ? 'Resource not found' : 'Request failed',
        request_id: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'not_found',
        message: 'Route not found',
        request_id: request.id,
      },
    });
  });

  app.get('/health/live', async () => ({
    status: 'ok',
    service: 'api',
    version: dependencies.buildVersion,
  }));

  app.get('/health/ready', async (_request, reply) => {
    const status: ReadinessStatus = {
      postgres: false,
      redis: false,
      migration: 0,
      required_migration: dependencies.requiredMigration,
    };
    const [postgres, redis] = await Promise.allSettled([
      dependencies.store.ping(),
      dependencies.redis.ping(),
    ]);
    status.postgres = postgres.status === 'fulfilled';
    status.redis = redis.status === 'fulfilled';
    if (status.postgres) {
      status.migration = await dependencies.store.getMigrationVersion();
    }
    const ready =
      status.postgres &&
      status.redis &&
      status.migration >= dependencies.requiredMigration;
    metrics.gauge('agentops_dependency_ready', status.postgres ? 1 : 0, {
      dependency: 'postgres',
    });
    metrics.gauge('agentops_dependency_ready', status.redis ? 1 : 0, {
      dependency: 'redis',
    });
    metrics.gauge(
      'agentops_migration_version',
      status.migration,
    );
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      checks: status,
    });
  });

  app.get('/metrics', async (_request, reply) =>
    reply.type('text/plain; version=0.0.4; charset=utf-8').send(metrics.render()),
  );

  app.get<{ Querystring: RawPageQuery }>(
    '/api/v1/tenants',
    { schema: { querystring: pageQuerySchema } },
    async (request) => dependencies.store.listTenants(pageQuery(request)),
  );

  app.get<{ Params: TenantParams }>(
    '/api/v1/tenants/:tenantId',
    { schema: { params: tenantParamsSchema } },
    async (request, reply) => {
      const tenant = await dependencies.store.getTenant(request.params.tenantId);
      return tenant ?? reply.status(404).send(notFound(request, 'tenant_not_found'));
    },
  );

  app.get<{ Params: TenantParams }>(
    '/api/v1/tenants/:tenantId/model-config',
    { schema: { params: tenantParamsSchema } },
    async (request, reply) => {
      const config = await dependencies.store.getActiveModelConfig(
        request.params.tenantId,
      );
      return config ?? reply.status(404).send(notFound(request, 'model_config_not_found'));
    },
  );

  app.get<{ Params: TenantParams; Querystring: RawPageQuery }>(
    '/api/v1/tenants/:tenantId/traces',
    {
      schema: {
        params: tenantParamsSchema,
        querystring: pageQuerySchema,
      },
    },
    async (request) =>
      dependencies.store.listTraces(
        request.params.tenantId,
        pageQuery(request),
      ),
  );

  app.get<{
    Params: TenantParams;
    Querystring: RawPageQuery & { state?: string };
  }>(
    '/api/v1/tenants/:tenantId/approvals',
    {
      schema: {
        params: tenantParamsSchema,
        querystring: {
          ...pageQuerySchema,
          properties: {
            ...pageQuerySchema.properties,
            state: { type: 'string', enum: [...APPROVAL_STATES] },
          },
        },
      },
    },
    async (request) =>
      dependencies.store.listApprovals(
        request.params.tenantId,
        parseState(request.query.state, APPROVAL_STATES),
        pageQuery(request),
      ),
  );

  app.get<{
    Params: TenantParams;
    Querystring: RawPageQuery & { state?: string };
  }>(
    '/api/v1/tenants/:tenantId/release-candidates',
    {
      schema: {
        params: tenantParamsSchema,
        querystring: {
          ...pageQuerySchema,
          properties: {
            ...pageQuerySchema.properties,
            state: { type: 'string', enum: [...RELEASE_STATES] },
          },
        },
      },
    },
    async (request) =>
      dependencies.store.listReleaseCandidates(
        request.params.tenantId,
        parseState(request.query.state, RELEASE_STATES),
        pageQuery(request),
      ),
  );

  if (dependencies.chatwootIngress !== undefined) {
    void app.register(async (scope) => {
      await registerChatwootRoutes(scope, dependencies.chatwootIngress!);
    });
  }
  if (dependencies.operations !== undefined) {
    void app.register(async (scope) => {
      await registerOperationsRoutes(scope, dependencies.operations!);
    });
  }

  if (dependencies.closeDependencies !== false) {
    app.addHook('onClose', async () => {
      await Promise.allSettled([
        dependencies.store.close(),
        dependencies.redis.close(),
      ]);
    });
  }

  return app;
}

interface RawPageQuery {
  limit?: string | number;
  offset?: string | number;
}

interface TenantParams {
  tenantId: string;
}

const pageQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    offset: { type: 'integer', minimum: 0, maximum: 1_000_000, default: 0 },
  },
} as const;

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantId'],
  additionalProperties: false,
  properties: {
    tenantId: { type: 'string', pattern: UUID_PATTERN },
  },
} as const;

function pageQuery(request: FastifyRequest<{ Querystring: RawPageQuery }>): PageQuery {
  return {
    limit: Number(request.query.limit ?? 50),
    offset: Number(request.query.offset ?? 0),
  };
}

function parseState<T extends string>(
  value: string | undefined,
  states: ReadonlySet<T>,
): T | null {
  return value !== undefined && states.has(value as T) ? (value as T) : null;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function notFound(request: FastifyRequest, code: string): object {
  return {
    error: {
      code,
      message: 'Resource not found',
      request_id: request.id,
    },
  };
}

function hasValidation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    error.validation !== undefined
  );
}

function getStatusCode(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }
  return 500;
}
