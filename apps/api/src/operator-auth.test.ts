import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import type {
  AgentOpsStore,
  CanonicalEventCreateInput,
  CanonicalEventCreateResult,
  Page,
  PageQuery,
  RedisCoordinator,
  TenantRecord,
} from './contracts.js';
import { buildApp } from './app.js';
import {
  mapOperatorClaims,
  OidcOperatorAccess,
  OperatorAccessError,
} from './operator-auth.js';
import { TestOperatorAccess } from './test-operator-access.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-4000-8000-000000000002';

test('claim mapping requires an operator role and explicit tenant scope', () => {
  const config = {
    roleClaim: 'roles',
    tenantClaim: 'tenants',
    operatorRole: 'operator',
    adminRole: 'admin',
  };
  assert.deepEqual(
    mapOperatorClaims(
      {
        sub: 'user-1',
        name: 'Operator One',
        email: 'one@example.test',
        roles: ['operator'],
        tenants: [TENANT_ID],
      },
      config,
    ),
    {
      subject: 'user-1',
      display_name: 'Operator One',
      email: 'one@example.test',
      roles: ['operator'],
      tenant_ids: [TENANT_ID],
      admin: false,
    },
  );
  assert.equal(
    mapOperatorClaims(
      { sub: 'admin-1', roles: ['admin'], tenants: [] },
      config,
    ).tenant_ids[0],
    '*',
  );
  assert.throws(
    () => mapOperatorClaims({ sub: 'user-2', roles: ['viewer'] }, config),
    (error: unknown) =>
      error instanceof OperatorAccessError && error.code === 'forbidden',
  );
});

test('operator APIs reject anonymous and cross-tenant access', async () => {
  const store = new FakeStore();
  const anonymous = buildApp({
    store,
    redis: new FakeRedis(),
    operatorAccess: new TestOperatorAccess(undefined, false),
    requiredMigration: 16,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    closeDependencies: false,
  });
  const anonymousResponse = await anonymous.inject({
    method: 'GET',
    url: '/api/v1/tenants',
  });
  assert.equal(anonymousResponse.statusCode, 401);
  await anonymous.close();

  const scoped = buildApp({
    store,
    redis: new FakeRedis(),
    operatorAccess: new TestOperatorAccess({
      subject: 'operator-1',
      display_name: null,
      email: null,
      roles: ['operator'],
      tenant_ids: [TENANT_ID],
      admin: false,
    }),
    requiredMigration: 16,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    closeDependencies: false,
  });
  const tenants = await scoped.inject({
    method: 'GET',
    url: '/api/v1/tenants',
  });
  assert.equal(tenants.statusCode, 200);
  assert.equal(store.filteredTenantIds?.[0], TENANT_ID);
  const forbidden = await scoped.inject({
    method: 'GET',
    url: `/api/v1/tenants/${OTHER_TENANT_ID}`,
  });
  assert.equal(forbidden.statusCode, 403);
  await scoped.close();
});

test('Chatwoot machine ingress remains independent of operator sessions', async () => {
  const app = buildApp({
    store: new FakeStore(),
    redis: new FakeRedis(),
    operatorAccess: new TestOperatorAccess(undefined, false),
    chatwootIngress: {
      async handle() {
        return { status: 202, body: { accepted: true } };
      },
    },
    requiredMigration: 16,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    closeDependencies: false,
  });
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/chatwoot/webhooks/${TENANT_ID}`,
    payload: { event: 'message_created' },
  });
  assert.equal(response.statusCode, 202);
  await app.close();
});

test('OIDC login creates a CSRF-bound session, rotates keys, and logout revokes it', async () => {
  const provider = await startProvider();
  const oldKey = Buffer.alloc(32, 11);
  const newKey = Buffer.alloc(32, 12);
  const first = createOidcApp(provider.issuer, [oldKey]);
  const jar = new Map<string, string>();
  try {
    const login = await first.inject({
      method: 'GET',
      url: '/api/v1/auth/login',
    });
    assert.equal(login.statusCode, 302);
    updateCookies(jar, login.headers['set-cookie']);
    const redirect = new URL(login.headers.location!);
    const state = redirect.searchParams.get('state');
    assert.ok(state);

    const mismatch = await first.inject({
      method: 'GET',
      url: '/api/v1/auth/callback?code=test-code&state=wrong-state',
      headers: { cookie: cookieHeader(jar) },
    });
    assert.notEqual(mismatch.statusCode, 302);

    const callback = await first.inject({
      method: 'GET',
      url: `/api/v1/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(callback.statusCode, 302);
    updateCookies(jar, callback.headers['set-cookie']);
    const session = await first.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(session.statusCode, 200);
    assert.equal(session.json().principal.subject, 'provider-user-1');
    const csrf = session.json().csrf_token as string;

    const missingCsrf = await first.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(missingCsrf.statusCode, 403);

    await first.close();
    const rotated = createOidcApp(provider.issuer, [newKey, oldKey]);
    const rotatedSession = await rotated.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(rotatedSession.statusCode, 200);
    const logout = await rotated.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: cookieHeader(jar),
        'x-csrf-token': csrf,
      },
    });
    assert.equal(logout.statusCode, 204);
    updateCookies(jar, logout.headers['set-cookie']);
    const revoked = await rotated.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(revoked.statusCode, 401);
    await rotated.close();
  } finally {
    await first.close().catch(() => {});
    await provider.close();
  }
});

test('expired operator sessions fail closed', async () => {
  const provider = await startProvider();
  const app = createOidcApp(provider.issuer, [Buffer.alloc(32, 13)], 1);
  const jar = new Map<string, string>();
  try {
    const login = await app.inject({ method: 'GET', url: '/api/v1/auth/login' });
    updateCookies(jar, login.headers['set-cookie']);
    const state = new URL(login.headers.location!).searchParams.get('state');
    assert.ok(state);
    const callback = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
      headers: { cookie: cookieHeader(jar) },
    });
    updateCookies(jar, callback.headers['set-cookie']);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(session.statusCode, 401);
  } finally {
    await app.close();
    await provider.close();
  }
});

function createOidcApp(
  issuer: string,
  keys: readonly Buffer[],
  sessionTtlSeconds = 300,
) {
  return buildApp({
    store: new FakeStore(),
    redis: new FakeRedis(),
    operatorAccess: new OidcOperatorAccess({
      issuer,
      clientId: 'agentops-test',
      clientSecret: 'secret',
      callbackUri: 'https://agentops.example.test/api/v1/auth/callback',
      roleClaim: 'agentops_roles',
      tenantClaim: 'agentops_tenants',
      operatorRole: 'operator',
      adminRole: 'admin',
      sessionKeys: keys,
      sessionTtlSeconds,
      secureCookie: true,
    }),
    requiredMigration: 16,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    closeDependencies: false,
  });
}

async function startProvider(): Promise<{ issuer: string; close(): Promise<void> }> {
  let issuer = '';
  const server: Server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/.well-known/openid-configuration') {
      response.end(JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        code_challenge_methods_supported: ['S256'],
      }));
      return;
    }
    if (request.url === '/token') {
      response.end(JSON.stringify({
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 300,
      }));
      return;
    }
    if (request.url === '/userinfo') {
      response.end(JSON.stringify({
        sub: 'provider-user-1',
        name: 'Provider User',
        agentops_roles: ['operator'],
        agentops_tenants: [TENANT_ID],
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  issuer = `http://127.0.0.1:${address.port}`;
  return {
    issuer,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    ),
  };
}

function updateCookies(
  jar: Map<string, string>,
  setCookie: string | string[] | undefined,
): void {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const value of values) {
    const pair = value.split(';', 1)[0]!;
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const cookieValue = pair.slice(separator + 1);
    if (cookieValue.length === 0) jar.delete(name);
    else jar.set(name, cookieValue);
  }
}

function cookieHeader(jar: ReadonlyMap<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

class FakeStore implements AgentOpsStore {
  filteredTenantIds: readonly string[] | null = null;
  readonly tenant: TenantRecord = {
    id: TENANT_ID,
    slug: 'tenant',
    display_name: 'Tenant',
    status: 'active',
    metadata: {},
    created_at: '2026-06-22T00:00:00.000Z',
    updated_at: '2026-06-22T00:00:00.000Z',
  };
  async ping(): Promise<void> {}
  async close(): Promise<void> {}
  async getMigrationVersion(): Promise<number> { return 16; }
  async listTenants(query: PageQuery): Promise<Page<TenantRecord>> {
    return { items: [this.tenant], total: 1, ...query };
  }
  async listTenantsByIds(
    tenantIds: readonly string[],
    query: PageQuery,
  ): Promise<Page<TenantRecord>> {
    this.filteredTenantIds = tenantIds;
    const items = tenantIds.includes(TENANT_ID) ? [this.tenant] : [];
    return { items, total: items.length, ...query };
  }
  async getTenant(tenantId: string): Promise<TenantRecord | null> {
    return tenantId === TENANT_ID ? this.tenant : null;
  }
  async getActiveModelConfig(): Promise<null> { return null; }
  async listTraces(_tenantId: string, query: PageQuery): Promise<Page<never>> {
    return { items: [], total: 0, ...query };
  }
  async listApprovals(
    _tenantId: string,
    _state: null,
    query: PageQuery,
  ): Promise<Page<never>> {
    return { items: [], total: 0, ...query };
  }
  async listReleaseCandidates(
    _tenantId: string,
    _state: null,
    query: PageQuery,
  ): Promise<Page<never>> {
    return { items: [], total: 0, ...query };
  }
  async createOrGetCanonicalEvent(
    _input: CanonicalEventCreateInput,
  ): Promise<CanonicalEventCreateResult> {
    throw new Error('not used');
  }
}

class FakeRedis implements RedisCoordinator {
  async ping(): Promise<void> {}
  async close(): Promise<void> {}
  async claimDedupeKeys(): Promise<boolean> { return true; }
  async acquireLock(): Promise<null> { return null; }
}
