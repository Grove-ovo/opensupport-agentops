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
import { OperatorAccessError } from './operator-auth.js';

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
  logger?: boolean | {
    level: string;
    base?: Readonly<Record<string, unknown>>;
  };
  bodyLimitBytes?: number;
  requestTimeoutMs?: number;
  connectionTimeoutMs?: number;
  keepAliveTimeoutMs?: number;
  maxRequestsPerSocket?: number;
}

export function buildApp(
  dependencies: AppDependencies,
  options: BuildAppOptions = {},
): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    genReqId: (request) => headerValue(request.headers['x-request-id']) ?? randomUUID(),
    disableRequestLogging: false,
    bodyLimit: options.bodyLimitBytes ?? 1_048_576,
    requestTimeout: options.requestTimeoutMs ?? 35_000,
    connectionTimeout: options.connectionTimeoutMs ?? 10_000,
    keepAliveTimeout: options.keepAliveTimeoutMs ?? 20_000,
    maxRequestsPerSocket: options.maxRequestsPerSocket ?? 1_000,
  });
  const metrics = new MetricsRegistry();
  metrics.gauge('agentops_info', 1, {
    service: 'api',
    version: dependencies.buildVersion,
  });
  dependencies.operatorAccess.register(app);

  app.addHook('onResponse', async (request, reply) => {
    metrics.increment('agentops_http_requests_total', {
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched',
      status: String(reply.statusCode),
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof OperatorAccessError) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: operatorAccessMessage(error.code),
          request_id: request.id,
        },
      });
      return;
    }
    const validation = hasValidation(error);
    const statusCode = validation ? 400 : getStatusCode(error);
    const code = stableErrorCode(statusCode, validation);
    request.log.error({ err: error, request_id: request.id }, 'request failed');
    void reply.status(statusCode).send({
      error: {
        code,
        message: stableErrorMessage(code),
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

  void app.register(async (scope) => {
    scope.addHook(
      'preHandler',
      dependencies.operatorAccess.requireSession.bind(dependencies.operatorAccess),
    );

    scope.get<{ Querystring: RawPageQuery }>(
      '/api/v1/tenants',
      { schema: { querystring: pageQuerySchema } },
      async (request) => {
        const principal = dependencies.operatorAccess.principal(request);
        return principal.admin
          ? dependencies.store.listTenants(pageQuery(request))
          : dependencies.store.listTenantsByIds(
              principal.tenant_ids,
              pageQuery(request),
            );
      },
    );

    scope.get<{ Params: TenantParams }>(
      '/api/v1/tenants/:tenantId',
      { schema: { params: tenantParamsSchema } },
      async (request, reply) => {
        dependencies.operatorAccess.assertTenant(
          request,
          request.params.tenantId,
        );
        const tenant = await dependencies.store.getTenant(request.params.tenantId);
        return tenant ?? reply.status(404).send(notFound(request, 'tenant_not_found'));
      },
    );

    scope.get<{ Params: TenantParams }>(
      '/api/v1/tenants/:tenantId/model-config',
      { schema: { params: tenantParamsSchema } },
      async (request, reply) => {
        dependencies.operatorAccess.assertTenant(
          request,
          request.params.tenantId,
        );
        const config = await dependencies.store.getActiveModelConfig(
          request.params.tenantId,
        );
        return config ?? reply.status(404).send(notFound(request, 'model_config_not_found'));
      },
    );

    scope.get<{ Params: TenantParams; Querystring: RawPageQuery }>(
      '/api/v1/tenants/:tenantId/traces',
      {
        schema: {
          params: tenantParamsSchema,
          querystring: pageQuerySchema,
        },
      },
      async (request) => {
        dependencies.operatorAccess.assertTenant(
          request,
          request.params.tenantId,
        );
        return dependencies.store.listTraces(
          request.params.tenantId,
          pageQuery(request),
        );
      },
    );

    scope.get<{
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
      async (request) => {
        dependencies.operatorAccess.assertTenant(
          request,
          request.params.tenantId,
        );
        return dependencies.store.listApprovals(
          request.params.tenantId,
          parseState(request.query.state, APPROVAL_STATES),
          pageQuery(request),
        );
      },
    );

    scope.get<{
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
      async (request) => {
        dependencies.operatorAccess.assertTenant(
          request,
          request.params.tenantId,
        );
        return dependencies.store.listReleaseCandidates(
          request.params.tenantId,
          parseState(request.query.state, RELEASE_STATES),
          pageQuery(request),
        );
      },
    );

    if (dependencies.operations !== undefined) {
      await registerOperationsRoutes(
        scope,
        dependencies.operations,
        dependencies.operatorAccess,
      );
    }
  });

  if (dependencies.chatwootIngress !== undefined) {
    void app.register(async (scope) => {
      await registerChatwootRoutes(scope, dependencies.chatwootIngress!);
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

function operatorAccessMessage(code: OperatorAccessError['code']): string {
  if (code === 'authentication_required') return 'Authentication required';
  if (code === 'csrf_invalid') return 'CSRF token is missing or invalid';
  if (code === 'actor_identity_forbidden') {
    return 'Audit actor is derived from the authenticated identity';
  }
  return 'Operator is not authorized for this tenant';
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

function stableErrorCode(statusCode: number, validation: boolean): string {
  if (validation) return 'invalid_request';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 408) return 'request_timeout';
  if (statusCode === 413) return 'payload_too_large';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode === 502) return 'bad_gateway';
  if (statusCode === 503) return 'service_unavailable';
  if (statusCode === 504) return 'upstream_timeout';
  return 'internal_error';
}

function stableErrorMessage(code: string): string {
  if (code === 'invalid_request') return 'Request validation failed';
  if (code === 'not_found') return 'Resource not found';
  if (code === 'request_timeout') return 'Request timed out';
  if (code === 'payload_too_large') return 'Request payload is too large';
  if (code === 'rate_limited') return 'Request rate limit exceeded';
  if (code === 'upstream_timeout') return 'Upstream request timed out';
  if (code === 'bad_gateway') return 'Upstream service failed';
  if (code === 'service_unavailable') return 'Service unavailable';
  return 'Request failed';
}
