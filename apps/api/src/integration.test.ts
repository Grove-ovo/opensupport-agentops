import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { CanonicalInboundEvent } from '@opensupport/shared';
import { createPostgresPool } from './database.js';
import { NodeRedisCoordinator } from './redis.js';
import { PostgresAgentOpsStore } from './repositories.js';

const RUN = process.env.AGENTOPS_RUN_INTEGRATION === '1';
const integration = RUN ? test : test.skip;

integration('PostgreSQL repositories and Redis coordination use real services', async (context) => {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://agentops:agentops@localhost:5432/agentops';
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
  const pool = createPostgresPool(databaseUrl);
  const store = new PostgresAgentOpsStore(pool);
  const redis = await NodeRedisCoordinator.connect(redisUrl);
  let tenantId: string | null = null;
  context.after(async () => {
    if (tenantId !== null) {
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
    await Promise.all([store.close(), redis.close()]);
  });

  assert.equal(await store.getMigrationVersion(), 14);
  await store.ping();
  await redis.ping();

  tenantId = randomUUID();
  await pool.query(
    `INSERT INTO tenants (id, slug, display_name)
     VALUES ($1, $2, $3)`,
    [tenantId, `integration-${tenantId.slice(0, 8)}`, 'Integration Tenant'],
  );
  const tenant = await store.getTenant(tenantId);
  assert.equal(tenant?.display_name, 'Integration Tenant');

  const event: CanonicalInboundEvent = {
    tenant_id: tenantId,
    source: 'agent_bot',
    conversation_id: 'conversation-1',
    message_id: 'message-1',
    event_type: 'message_created',
    dedupe_key: `${tenantId}:conversation-1:message-1:message_created`,
    payload_hash: 'a'.repeat(64),
    is_customer_message: true,
    is_self_outgoing: false,
  };
  const created = await store.createOrGetCanonicalEvent({
    event,
    deliveryKeys: ['delivery-1'],
    decision: 'pipeline_seeded',
  });
  const duplicate = await store.createOrGetCanonicalEvent({
    event,
    deliveryKeys: ['delivery-2'],
    decision: 'pipeline_seeded',
  });
  assert.equal(created.status, 'created');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(created.record.id, duplicate.record.id);

  const key = `integration:${randomUUID()}`;
  assert.equal(await redis.claimDedupeKeys([key, `${key}:canonical`], 60), true);
  assert.equal(await redis.claimDedupeKeys([key, `${key}:other`], 60), false);

  const lock = await redis.acquireLock(key, 5_000);
  assert.ok(lock);
  assert.equal(await redis.acquireLock(key, 5_000), null);
  assert.equal(await lock.release(), true);
  const reacquired = await redis.acquireLock(key, 5_000);
  assert.ok(reacquired);
  assert.equal(await reacquired.release(), true);
});
