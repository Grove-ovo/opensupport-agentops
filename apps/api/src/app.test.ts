import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { ConfigError, loadApiConfig } from './config.js';
import { TestOperatorAccess } from './test-operator-access.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const CONFIG_DIRECTORY = mkdtempSync(join(tmpdir(), 'agentops-auth-config-'));
const SESSION_KEY_PATH = join(CONFIG_DIRECTORY, 'session-key');
writeFileSync(SESSION_KEY_PATH, Buffer.alloc(32, 7), { mode: 0o600 });
test.after(() => rmSync(CONFIG_DIRECTORY, { recursive: true, force: true }));

test('configuration rejects missing dependency URLs', () => {
  assert.throws(
    () => loadApiConfig({}),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.includes('DATABASE_URL:required') &&
      error.issues.includes('REDIS_URL:required') &&
      error.issues.includes('AGENTOPS_MASTER_KEY:required'),
  );
});

test('configuration validates the deployment master key', () => {
  assert.throws(
    () =>
      loadApiConfig({
        DATABASE_URL: 'postgresql://agentops:agentops@localhost:5432/agentops',
        REDIS_URL: 'redis://localhost:6379/0',
        AGENTOPS_MASTER_KEY: 'base64:c2hvcnQ=',
      }),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.includes('AGENTOPS_MASTER_KEY:invalid'),
  );
  const config = loadApiConfig({
    ...validAuthEnvironment(),
    DATABASE_URL: 'postgresql://agentops:agentops@localhost:5432/agentops',
    REDIS_URL: 'redis://localhost:6379/0',
    AGENTOPS_MASTER_KEY: `base64url:${Buffer.alloc(32, 1).toString('base64url')}`,
  });
  assert.equal(config.requiredMigration, 16);
});

test('configuration reads the deployment master key from a secret file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-config-'));
  const path = join(directory, 'master-key');
  const masterKey = `base64url:${Buffer.alloc(32, 2).toString('base64url')}`;
  writeFileSync(path, `${masterKey}\n`, { mode: 0o600 });

  try {
    const config = loadApiConfig({
      ...validAuthEnvironment(),
      DATABASE_URL: 'postgresql://agentops:agentops@localhost:5432/agentops',
      REDIS_URL: 'redis://localhost:6379/0',
      AGENTOPS_MASTER_KEY_FILE: path,
    });
    assert.equal(config.masterKey, masterKey);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function validAuthEnvironment(): NodeJS.ProcessEnv {
  return {
    AGENTOPS_OIDC_ISSUER: 'https://identity.example.test',
    AGENTOPS_OIDC_CLIENT_ID: 'agentops-test',
    AGENTOPS_OIDC_CLIENT_SECRET: 'test-secret',
    AGENTOPS_OIDC_CALLBACK_URI:
      'https://agentops.example.test/api/v1/auth/callback',
    AGENTOPS_OPERATOR_SESSION_KEY_FILES: SESSION_KEY_PATH,
  };
}

test('liveness, readiness, metrics, and tenant routes expose stable contracts', async () => {
  const store = new FakeStore();
  const redis = new FakeRedis();
  const app = buildApp({
    store,
    redis,
    requiredMigration: 14,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    operatorAccess: new TestOperatorAccess(),
    closeDependencies: false,
  });
  test.after(() => app.close());

  const live = await app.inject({ method: 'GET', url: '/health/live' });
  assert.equal(live.statusCode, 200);
  assert.deepEqual(live.json(), {
    status: 'ok',
    service: 'api',
    version: 'test',
  });

  const ready = await app.inject({ method: 'GET', url: '/health/ready' });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().checks.migration, 14);

  const tenants = await app.inject({
    method: 'GET',
    url: '/api/v1/tenants?limit=10&offset=0',
    headers: { 'x-request-id': 'request-1' },
  });
  assert.equal(tenants.statusCode, 200);
  assert.equal(tenants.json().items[0].id, TENANT_ID);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/v1/tenants/00000000-0000-4000-8000-000000000099',
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'tenant_not_found');

  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.equal(metrics.statusCode, 200);
  assert.match(metrics.body, /agentops_http_requests_total/);
  assert.match(metrics.body, /agentops_dependency_ready/);
});

test('readiness fails when Redis is unavailable or migrations are behind', async () => {
  const store = new FakeStore();
  store.migration = 13;
  const redis = new FakeRedis();
  redis.available = false;
  const app = buildApp({
    store,
    redis,
    requiredMigration: 14,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    operatorAccess: new TestOperatorAccess(),
    closeDependencies: false,
  });
  test.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/health/ready' });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().status, 'not_ready');
  assert.equal(response.json().checks.redis, false);
  assert.equal(response.json().checks.migration, 13);
});

test('invalid route parameters return a stable validation envelope', async () => {
  const app = buildApp({
    store: new FakeStore(),
    redis: new FakeRedis(),
    requiredMigration: 14,
    dedupeTtlSeconds: 86_400,
    buildVersion: 'test',
    operatorAccess: new TestOperatorAccess(),
    closeDependencies: false,
  });
  test.after(() => app.close());
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/tenants/not-a-uuid',
    headers: { 'x-request-id': 'invalid-1' },
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: {
      code: 'invalid_request',
      message: 'Request validation failed',
      request_id: 'invalid-1',
    },
  });
});

class FakeStore implements AgentOpsStore {
  migration = 14;
  readonly tenant: TenantRecord = {
    id: TENANT_ID,
    slug: 'test-tenant',
    display_name: 'Test Tenant',
    status: 'active',
    metadata: {},
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
  };

  async ping(): Promise<void> {}
  async close(): Promise<void> {}
  async getMigrationVersion(): Promise<number> {
    return this.migration;
  }
  async listTenants(query: PageQuery): Promise<Page<TenantRecord>> {
    return { items: [this.tenant], total: 1, ...query };
  }
  async listTenantsByIds(
    tenantIds: readonly string[],
    query: PageQuery,
  ): Promise<Page<TenantRecord>> {
    const items = tenantIds.includes(this.tenant.id) ? [this.tenant] : [];
    return { items, total: items.length, ...query };
  }
  async getTenant(tenantId: string): Promise<TenantRecord | null> {
    return tenantId === this.tenant.id ? this.tenant : null;
  }
  async getActiveModelConfig(): Promise<null> {
    return null;
  }
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
    throw new Error('not implemented in API route test');
  }
}

class FakeRedis implements RedisCoordinator {
  available = true;
  async ping(): Promise<void> {
    if (!this.available) {
      throw new Error('unavailable');
    }
  }
  async close(): Promise<void> {}
  async claimDedupeKeys(): Promise<boolean> {
    return true;
  }
  async acquireLock(): Promise<null> {
    return null;
  }
}
