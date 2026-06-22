import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import type { OperatorAccess, OperatorPrincipal } from './contracts.js';
import { OperatorAccessError } from './operator-auth.js';

export class TestOperatorAccess implements OperatorAccess {
  constructor(
    private readonly identity: OperatorPrincipal = {
      subject: 'oidc:test-operator',
      display_name: 'Test Operator',
      email: 'operator@example.test',
      roles: ['admin'],
      tenant_ids: ['*'],
      admin: true,
    },
    private readonly authenticated = true,
  ) {}

  register(_app: FastifyInstance): void {}

  async requireSession(
    _request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!this.authenticated) {
      throw new OperatorAccessError('authentication_required', 401);
    }
  }

  async requireCsrf(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    await this.requireSession(request, _reply);
    if (request.headers['x-csrf-token'] !== 'test-csrf') {
      throw new OperatorAccessError('csrf_invalid', 403);
    }
  }

  principal(_request: FastifyRequest): OperatorPrincipal {
    if (!this.authenticated) {
      throw new OperatorAccessError('authentication_required', 401);
    }
    return this.identity;
  }

  assertTenant(
    request: FastifyRequest,
    tenantId: string,
  ): OperatorPrincipal {
    const principal = this.principal(request);
    if (!principal.admin && !principal.tenant_ids.includes(tenantId)) {
      throw new OperatorAccessError('forbidden', 403);
    }
    return principal;
  }
}
