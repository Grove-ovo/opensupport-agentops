import { randomBytes, timingSafeEqual } from 'node:crypto';
import oauthPlugin from '@fastify/oauth2';
import secureSession from '@fastify/secure-session';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import type { OperatorAccess, OperatorPrincipal } from './contracts.js';

const SESSION_KEY = 'operator';
const CSRF_HEADER = 'x-csrf-token';

export interface OidcOperatorAccessConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  callbackUri: string;
  roleClaim: string;
  tenantClaim: string;
  operatorRole: string;
  adminRole: string;
  sessionKeys: readonly Buffer[];
  sessionTtlSeconds: number;
  secureCookie: boolean;
}

interface OperatorSession {
  principal: OperatorPrincipal;
  csrf_token: string;
  issued_at: number;
  expires_at: number;
}

declare module '@fastify/secure-session' {
  interface SessionData {
    operator?: OperatorSession;
  }
}

export class OperatorAccessError extends Error {
  constructor(
    readonly code:
      | 'authentication_required'
      | 'forbidden'
      | 'csrf_invalid'
      | 'actor_identity_forbidden',
    readonly statusCode: 401 | 403,
  ) {
    super(code);
    this.name = 'OperatorAccessError';
  }
}

export class OidcOperatorAccess implements OperatorAccess {
  constructor(private readonly config: OidcOperatorAccessConfig) {}

  register(app: FastifyInstance): void {
    void app.register(secureSession, {
      key: [...this.config.sessionKeys],
      cookieName: 'agentops_operator',
      expiry: this.config.sessionTtlSeconds,
      cookie: {
        path: '/',
        httpOnly: true,
        secure: this.config.secureCookie,
        sameSite: 'lax',
        maxAge: this.config.sessionTtlSeconds,
      },
    });
    void app.register(oauthPlugin, {
      name: 'operatorOAuth2',
      scope: ['openid', 'profile', 'email'],
      credentials: {
        client: {
          id: this.config.clientId,
          secret: this.config.clientSecret,
        },
      },
      discovery: { issuer: this.config.issuer },
      callbackUri: this.config.callbackUri,
      startRedirectPath: '/api/v1/auth/login',
      pkce: 'S256',
      redirectStateCookieName: 'agentops_oidc_state',
      verifierCookieName: 'agentops_oidc_verifier',
      cookie: {
        path: '/',
        httpOnly: true,
        secure: this.config.secureCookie,
        sameSite: 'lax',
        maxAge: 600,
      },
    });

    app.get('/api/v1/auth/callback', async (request, reply) => {
      const oauth = app.oauth2OperatorOAuth2;
      if (oauth === undefined) {
        throw new Error('OIDC provider is not initialized');
      }
      const token = await oauth.getAccessTokenFromAuthorizationCodeFlow(
        request,
        reply,
      );
      const claims = await oauth.userinfo(token.token);
      const principal = mapOperatorClaims(claims, this.config);
      const now = Math.floor(Date.now() / 1000);
      request.session.regenerate();
      request.session.set(SESSION_KEY, {
        principal,
        csrf_token: randomBytes(32).toString('base64url'),
        issued_at: now,
        expires_at: now + this.config.sessionTtlSeconds,
      } satisfies OperatorSession);
      return reply.redirect('/');
    });

    app.get('/api/v1/auth/session', async (request) => {
      const session = requireOperatorSession(request);
      return {
        principal: session.principal,
        csrf_token: session.csrf_token,
        expires_at: session.expires_at,
      };
    });

    app.post(
      '/api/v1/auth/logout',
      { preHandler: this.requireCsrf.bind(this) },
      async (request, reply) => {
        request.session.delete();
        return reply.status(204).send();
      },
    );
  }

  async requireSession(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    requireOperatorSession(request);
  }

  async requireCsrf(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const session = requireOperatorSession(request);
    const submitted = headerValue(request.headers[CSRF_HEADER]);
    if (
      submitted === null ||
      !safeEqual(submitted, session.csrf_token)
    ) {
      throw new OperatorAccessError('csrf_invalid', 403);
    }
  }

  principal(request: FastifyRequest): OperatorPrincipal {
    return requireOperatorSession(request).principal;
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

export function mapOperatorClaims(
  claims: object,
  config: Pick<
    OidcOperatorAccessConfig,
    'roleClaim' | 'tenantClaim' | 'operatorRole' | 'adminRole'
  >,
): OperatorPrincipal {
  const subject = stringClaim(claims, 'sub');
  const roles = stringListClaim(claims, config.roleClaim);
  const tenantIds = stringListClaim(claims, config.tenantClaim);
  const admin = roles.includes(config.adminRole);
  if (
    subject === null ||
    (!admin && !roles.includes(config.operatorRole)) ||
    (!admin && tenantIds.length === 0)
  ) {
    throw new OperatorAccessError('forbidden', 403);
  }
  return {
    subject,
    display_name:
      stringClaim(claims, 'name') ?? stringClaim(claims, 'preferred_username'),
    email: stringClaim(claims, 'email'),
    roles,
    tenant_ids: admin ? ['*'] : tenantIds,
    admin,
  };
}

function requireOperatorSession(request: FastifyRequest): OperatorSession {
  const session = request.session.get(SESSION_KEY) as
    | OperatorSession
    | undefined;
  const now = Math.floor(Date.now() / 1000);
  if (
    session === undefined ||
    session.expires_at <= now ||
    session.principal.subject.length === 0
  ) {
    request.session.delete();
    throw new OperatorAccessError('authentication_required', 401);
  }
  return session;
}

function stringClaim(claims: object, name: string): string | null {
  const value = Reflect.get(claims, name);
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringListClaim(claims: object, name: string): string[] {
  const value = Reflect.get(claims, name);
  if (Array.isArray(value)) {
    return [...new Set(value.filter((item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
    ).map((item) => item.trim()))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean))];
  }
  return [];
}

function headerValue(value: string | readonly string[] | undefined): string | null {
  return typeof value === 'string' ? value : value?.[0] ?? null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(rightBuffer, rightBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
