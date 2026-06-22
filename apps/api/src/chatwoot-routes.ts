import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import type { ChatwootIngressHandler } from './contracts.js';

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export async function registerChatwootRoutes(
  app: FastifyInstance,
  handler: ChatwootIngressHandler,
): Promise<void> {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => done(null, body),
  );
  const route = (
    source: 'agent_bot' | 'account_webhook',
  ) => async (
    request: FastifyRequest<{
      Params: { tenantId: string };
      Body: string;
    }>,
    reply: FastifyReply,
  ) => {
    const result = await handler.handle({
      tenantId: request.params.tenantId,
      source,
      headers: request.headers,
      rawBody: request.body,
    });
    request.log.info(
      {
        request_id: request.id,
        tenant_id: request.params.tenantId,
        source,
        canonical_event_id: result.body.canonical_event_id ?? null,
        trace_id: result.body.trace_id ?? null,
        outcome: result.body.outcome ?? null,
        decision: result.body.decision ?? null,
      },
      'chatwoot ingress completed',
    );
    return reply.status(result.status).send(result.body);
  };
  const options = {
    schema: {
      params: {
        type: 'object',
        required: ['tenantId'],
        additionalProperties: false,
        properties: { tenantId: { type: 'string', pattern: UUID_PATTERN } },
      },
      body: { type: 'string', minLength: 2, maxLength: 1_000_000 },
    },
  } as const;
  app.post<{ Params: { tenantId: string }; Body: string }>(
    '/api/v1/chatwoot/agent-bot/:tenantId',
    options,
    route('agent_bot'),
  );
  app.post<{ Params: { tenantId: string }; Body: string }>(
    '/api/v1/chatwoot/webhooks/:tenantId',
    options,
    route('account_webhook'),
  );
}
