import type { FastifyInstance, FastifyReply } from 'fastify';
import type { RuntimeMode } from '@opensupport/shared';
import type {
  OperationsService,
  OperatorAccess,
  TenantRecord,
} from './contracts.js';
import { OperationsError } from './operations.js';
import { OperatorAccessError } from './operator-auth.js';

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const idParamsSchema = {
  type: 'object',
  required: ['tenantId'],
  additionalProperties: false,
  properties: { tenantId: { type: 'string', pattern: UUID_PATTERN } },
} as const;

export async function registerOperationsRoutes(
  app: FastifyInstance,
  operations: OperationsService,
  operatorAccess: OperatorAccess,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    const tenantId = (request.params as { tenantId?: string }).tenantId;
    if (tenantId !== undefined) {
      operatorAccess.assertTenant(request, tenantId);
    }
  });

  app.get<{ Params: { tenantId: string } }>(
    '/api/v1/tenants/:tenantId/overview',
    { schema: { params: idParamsSchema } },
    async (request, reply) =>
      run(reply, () => operations.getOverview(request.params.tenantId)),
  );

  app.get<{ Params: { tenantId: string; traceId: string } }>(
    '/api/v1/tenants/:tenantId/traces/:traceId',
    { schema: { params: twoIdSchema('traceId') } },
    async (request, reply) =>
      run(reply, async () => {
        const record = await operations.getTrace(
          request.params.tenantId,
          request.params.traceId,
        );
        if (record === null) throw new OperationsError('trace_not_found', 404);
        return record;
      }),
  );

  app.post<{
    Params: { tenantId: string; approvalId: string };
    Body: {
      action: 'approve' | 'edit' | 'reject' | 'escalate';
      edited_reply?: string;
      idempotency_key: string;
      confirm: boolean;
    };
  }>(
    '/api/v1/tenants/:tenantId/approvals/:approvalId/actions',
    {
      preHandler: mutationGuards(operatorAccess),
      schema: {
        params: twoIdSchema('approvalId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'idempotency_key', 'confirm'],
          properties: {
            action: {
              type: 'string',
              enum: ['approve', 'edit', 'reject', 'escalate'],
            },
            edited_reply: { type: 'string', minLength: 1, maxLength: 20_000 },
            actor_id: { type: 'string', minLength: 1, maxLength: 256 },
            idempotency_key: {
              type: 'string',
              minLength: 1,
              maxLength: 256,
              pattern: '^[A-Za-z0-9._:-]+$',
            },
            confirm: { const: true },
          },
        },
      },
    },
    async (request, reply) =>
      run(reply, () =>
        operations.applyApprovalAction({
          tenantId: request.params.tenantId,
          approvalId: request.params.approvalId,
          action: request.body.action,
          actorId: operatorAccess.principal(request).subject,
          editedReply: request.body.edited_reply ?? null,
          idempotencyKey: request.body.idempotency_key,
        }),
      ),
  );

  app.get<{ Params: { tenantId: string; candidateId: string } }>(
    '/api/v1/tenants/:tenantId/releases/:candidateId',
    { schema: { params: twoIdSchema('candidateId') } },
    async (request, reply) =>
      run(reply, async () => {
        const record = await operations.getRelease(
          request.params.tenantId,
          request.params.candidateId,
        );
        if (record === null) {
          throw new OperationsError('release_candidate_not_found', 404);
        }
        return record;
      }),
  );

  app.post<{
    Params: { tenantId: string; candidateId: string };
    Body: {
      action: 'start_evaluation' | 'archive';
      idempotency_key: string;
      confirm: boolean;
    };
  }>(
    '/api/v1/tenants/:tenantId/releases/:candidateId/transitions',
    {
      preHandler: mutationGuards(operatorAccess),
      schema: {
        params: twoIdSchema('candidateId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'idempotency_key', 'confirm'],
          properties: {
            action: {
              type: 'string',
              enum: ['start_evaluation', 'archive'],
            },
            actor_id: { type: 'string', minLength: 1, maxLength: 256 },
            idempotency_key: {
              type: 'string',
              minLength: 1,
              maxLength: 256,
              pattern: '^[A-Za-z0-9._:-]+$',
            },
            confirm: { const: true },
          },
        },
      },
    },
    async (request, reply) =>
      run(reply, () =>
        operations.transitionRelease({
          tenantId: request.params.tenantId,
          candidateId: request.params.candidateId,
          action: request.body.action,
          actorId: operatorAccess.principal(request).subject,
          idempotencyKey: request.body.idempotency_key,
        }),
      ),
  );

  app.get<{ Params: { tenantId: string } }>(
    '/api/v1/tenants/:tenantId/settings',
    { schema: { params: idParamsSchema } },
    async (request, reply) =>
      run(reply, async () => {
        const settings = await operations.getSettings(request.params.tenantId);
        if (settings === null) throw new OperationsError('tenant_not_found', 404);
        return settings;
      }),
  );

  app.put<{
    Params: { tenantId: string };
    Body: {
      display_name: string;
      status: TenantRecord['status'];
      metadata: Record<string, unknown>;
    };
  }>(
    '/api/v1/tenants/:tenantId/settings/tenant',
    {
      preHandler: mutationGuards(operatorAccess),
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['display_name', 'status', 'metadata'],
          properties: {
            display_name: { type: 'string', minLength: 1, maxLength: 200 },
            status: {
              type: 'string',
              enum: ['active', 'suspended', 'archived'],
            },
            metadata: { type: 'object' },
            actor_id: { type: 'string', minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (request, reply) =>
      run(reply, () =>
        operations.updateTenant(request.params.tenantId, {
          displayName: request.body.display_name,
          status: request.body.status,
          metadata: request.body.metadata,
          actorId: operatorAccess.principal(request).subject,
        }),
      ),
  );

  app.put<{
    Params: { tenantId: string };
    Body: {
      provider: string;
      fast_model: string;
      strong_model: string;
      embedding_model: string;
      fallback_model: string;
      timeout_ms: number;
      max_cost_per_ticket: number;
      daily_budget: number;
      budget_currency: string;
      replacement_api_key?: string;
    };
  }>(
    '/api/v1/tenants/:tenantId/settings/model-config',
    {
      preHandler: mutationGuards(operatorAccess),
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'provider',
            'fast_model',
            'strong_model',
            'embedding_model',
            'fallback_model',
            'timeout_ms',
            'max_cost_per_ticket',
            'daily_budget',
            'budget_currency',
          ],
          properties: {
            provider: { type: 'string', minLength: 1, maxLength: 64 },
            fast_model: { type: 'string', minLength: 1, maxLength: 256 },
            strong_model: { type: 'string', minLength: 1, maxLength: 256 },
            embedding_model: { type: 'string', minLength: 1, maxLength: 256 },
            fallback_model: { type: 'string', minLength: 1, maxLength: 256 },
            timeout_ms: { type: 'integer', minimum: 1, maximum: 120_000 },
            max_cost_per_ticket: { type: 'number', minimum: 0 },
            daily_budget: { type: 'number', minimum: 0 },
            budget_currency: {
              type: 'string',
              pattern: '^[A-Za-z]{3}$',
            },
            replacement_api_key: {
              type: 'string',
              minLength: 1,
              maxLength: 10_000,
            },
            actor_id: { type: 'string', minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (request, reply) =>
      run(reply, () =>
        operations.updateModelConfig(request.params.tenantId, {
          provider: request.body.provider,
          fastModel: request.body.fast_model,
          strongModel: request.body.strong_model,
          embeddingModel: request.body.embedding_model,
          fallbackModel: request.body.fallback_model,
          timeoutMs: request.body.timeout_ms,
          maxCostPerTicket: request.body.max_cost_per_ticket,
          dailyBudget: request.body.daily_budget,
          budgetCurrency: request.body.budget_currency,
          replacementApiKey: request.body.replacement_api_key ?? null,
          actorId: operatorAccess.principal(request).subject,
        }),
      ),
  );

  app.put<{
    Params: { tenantId: string };
    Body: {
      base_url: string;
      account_id: number;
      inbox_id: number | null;
      agent_bot_id: number | null;
      runtime_mode: RuntimeMode;
      webhook_secret_ref?: string;
      api_token_ref?: string;
    };
  }>(
    '/api/v1/tenants/:tenantId/settings/chatwoot',
    {
      preHandler: mutationGuards(operatorAccess),
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'base_url',
            'account_id',
            'inbox_id',
            'agent_bot_id',
            'runtime_mode',
          ],
          properties: {
            base_url: { type: 'string', minLength: 1, maxLength: 2048 },
            account_id: { type: 'integer', minimum: 1 },
            inbox_id: {
              anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
            },
            agent_bot_id: {
              anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
            },
            runtime_mode: {
              type: 'string',
              enum: ['shadow', 'assist', 'auto'],
            },
            webhook_secret_ref: {
              type: 'string',
              pattern: '^env:[A-Z][A-Z0-9_]{1,127}$',
            },
            api_token_ref: {
              type: 'string',
              pattern: '^env:[A-Z][A-Z0-9_]{1,127}$',
            },
            actor_id: { type: 'string', minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (request, reply) =>
      run(reply, () =>
        operations.updateChatwoot(request.params.tenantId, {
          baseUrl: request.body.base_url,
          accountId: request.body.account_id,
          inboxId: request.body.inbox_id,
          agentBotId: request.body.agent_bot_id,
          runtimeMode: request.body.runtime_mode,
          webhookSecretRef: request.body.webhook_secret_ref ?? null,
          apiTokenRef: request.body.api_token_ref ?? null,
          actorId: operatorAccess.principal(request).subject,
        }),
      ),
  );

  app.get<{ Params: { tenantId: string } }>(
    '/api/v1/tenants/:tenantId/policy-versions',
    { schema: { params: idParamsSchema } },
    async (request, reply) =>
      run(reply, () => operations.getPolicyVersions(request.params.tenantId)),
  );

  app.get<{ Params: { tenantId: string; policyVersionId: string } }>(
    '/api/v1/tenants/:tenantId/policy-versions/:policyVersionId/documents',
    { schema: { params: twoIdSchema('policyVersionId') } },
    async (request, reply) =>
      run(reply, () =>
        operations.getPolicyDocuments(
          request.params.tenantId,
          request.params.policyVersionId,
        ),
      ),
  );

  app.post<{
    Params: { tenantId: string };
    Body: {
      name: string;
      documents: ReadonlyArray<{
        source_key: string;
        title: string;
        content: string;
      }>;
    };
  }>(
    '/api/v1/tenants/:tenantId/policy-versions',
    {
      preHandler: mutationGuards(operatorAccess),
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'documents'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 256 },
            documents: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['source_key', 'title', 'content'],
                properties: {
                  source_key: { type: 'string', minLength: 1, maxLength: 512 },
                  title: { type: 'string', minLength: 1, maxLength: 512 },
                  content: { type: 'string', minLength: 1, maxLength: 1_000_000 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) =>
      run(reply, () =>
        operations.createPolicyVersion(request.params.tenantId, {
          name: request.body.name,
          documents: request.body.documents,
          actorId: operatorAccess.principal(request).subject,
        }),
      ),
  );

  app.put<{ Params: { tenantId: string; policyVersionId: string } }>(
    '/api/v1/tenants/:tenantId/policy-versions/:policyVersionId/publish',
    {
      preHandler: mutationGuards(operatorAccess),
      schema: { params: twoIdSchema('policyVersionId') },
    },
    async (request, reply) =>
      run(reply, () =>
        operations.publishPolicyVersion(
          request.params.tenantId,
          request.params.policyVersionId,
          operatorAccess.principal(request).subject,
        ),
      ),
  );

  app.post<{
    Params: { tenantId: string };
    Body: { query: string; limit?: number };
  }>(
    '/api/v1/tenants/:tenantId/policy-retrieval-smoke-test',
    {
      preHandler: mutationGuards(operatorAccess),
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 2_000 },
            limit: { type: 'integer', minimum: 1, maximum: 50 },
          },
        },
      },
    },
    async (request, reply) =>
      run(reply, () => {
        const params: { query: string; limit?: number } = {
          query: request.body.query,
        };
        if (request.body.limit !== undefined) {
          params.limit = request.body.limit;
        }
        return operations.runRetrievalSmokeTest(request.params.tenantId, params);
      }),
  );
}

function mutationGuards(operatorAccess: OperatorAccess) {
  return [
    operatorAccess.requireCsrf.bind(operatorAccess),
    async (request: import('fastify').FastifyRequest) => {
      if (
        typeof request.body === 'object' &&
        request.body !== null &&
        Reflect.has(request.body, 'actor_id')
      ) {
        throw new OperatorAccessError('actor_identity_forbidden', 403);
      }
    },
  ];
}

function twoIdSchema(name: string) {
  return {
    type: 'object',
    required: ['tenantId', name],
    additionalProperties: false,
    properties: {
      tenantId: { type: 'string', pattern: UUID_PATTERN },
      [name]: { type: 'string', pattern: UUID_PATTERN },
    },
  } as const;
}

async function run<T>(
  reply: FastifyReply,
  action: () => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof OperationsError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: operationsMessage(error.code) },
      });
    }
    throw error;
  }
}

function operationsMessage(code: string): string {
  return code.replaceAll('_', ' ');
}
