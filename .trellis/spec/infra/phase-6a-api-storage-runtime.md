# Phase 6A API And Storage Runtime

## Scenario: Deployable API, PostgreSQL, And Redis Foundation

### 1. Scope / Trigger

- Trigger: changes to `apps/api`, application environment wiring, PostgreSQL
  repositories, Redis dedupe/locks, schema migration markers, canonical inbound
  events, or the async outbox.
- Applies to `apps/api`, `infra/migrations/0014_productization_runtime.sql`,
  `infra/verification/phase6a_productization_runtime.sql`, `.env.example`, and
  the root API/migration scripts.
- Domain packages must remain independent of Fastify, `pg`, and `redis`.

### 2. Signatures

Runtime:

```ts
loadApiConfig(env?: NodeJS.ProcessEnv): ApiConfig
createRuntimeApp(config: ApiConfig): Promise<FastifyInstance>
buildApp(dependencies: AppDependencies, options?: BuildAppOptions): FastifyInstance
```

Storage and coordination:

```ts
interface AgentOpsStore {
  ping(): Promise<void>;
  getMigrationVersion(): Promise<number>;
  createOrGetCanonicalEvent(
    input: CanonicalEventCreateInput,
  ): Promise<CanonicalEventCreateResult>;
}

interface RedisCoordinator {
  ping(): Promise<void>;
  claimDedupeKeys(keys: readonly string[], ttlSeconds: number): Promise<boolean>;
  acquireLock(key: string, ttlMilliseconds: number): Promise<Lock | null>;
}
```

Commands and endpoints:

```text
npm run db:migrate
npm run db:migrate:node
npm run db:verify:phase6a
npm run start:api
npm run test:api
npm run test:api:integration

GET /health/live
GET /health/ready
GET /metrics
GET /api/v1/tenants
GET /api/v1/tenants/:tenantId
GET /api/v1/tenants/:tenantId/model-config
GET /api/v1/tenants/:tenantId/traces
GET /api/v1/tenants/:tenantId/approvals
GET /api/v1/tenants/:tenantId/release-candidates
```

### 3. Contracts

Environment:

| Key | Required | Contract |
|-----|----------|----------|
| `DATABASE_URL` | Yes | PostgreSQL URL; no implicit production fallback |
| `REDIS_URL` | Yes | Redis URL; no implicit production fallback |
| `HOST` | No | Defaults to `0.0.0.0` |
| `PORT` | No | Integer `1..65535`, default `8080` |
| `AGENTOPS_REQUIRED_MIGRATION` | No | Readiness floor, default `14` |
| `AGENTOPS_DEDUPE_TTL_SECONDS` | No | `60..604800`, default `86400` |
| `AGENTOPS_SHUTDOWN_TIMEOUT_MS` | No | `1000..120000` |

Readiness is successful only when PostgreSQL and Redis answer and
`agentops_schema_migrations.max(version)` meets the configured floor.

Repository responses are project-owned DTOs. Numeric PostgreSQL values are
converted at the repository boundary. Model config reads expose only
`has_encrypted_api_key`; encrypted references and plaintext secrets are never
returned by operator APIs.

Redis dedupe claims all keys in one Lua script. If any key exists, none of the
new keys are written. Locks use a random token and compare-and-delete release.

Canonical event rows store identity, flags, hashes, decisions, and references;
they never store raw webhook bodies or customer text.

> **Warning**: Earlier migrations rebuild composite unique constraints used by
> later foreign keys. A later table must have its foreign key dropped in the
> earlier migration before the unique constraint is rebuilt, then restored in
> the later owning migration. Otherwise the complete chain is not idempotent.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Required URL missing or malformed | Startup throws `ConfigError` |
| Invalid query or tenant UUID | HTTP `400`, `invalid_request` |
| Unknown resource | HTTP `404`, stable resource code |
| PostgreSQL unavailable | Readiness `503`, `postgres=false` |
| Redis unavailable | Readiness `503`, `redis=false` |
| Migration behind configured floor | Readiness `503` |
| Duplicate canonical dedupe key | Existing row returned as `duplicate` |
| Any Redis dedupe key already exists | Atomic claim returns `false` |
| Lock token differs or expired | Release returns `false` |
| pgvector is not provisioned by DBA | Migration `0005` fails explicitly |
| Later FK blocks an earlier constraint rebuild | Second full migration fails |

### 5. Good/Base/Bad Cases

- Good: validate transport input, call `AgentOpsStore`, and serialize its DTO.
- Good: provision pgvector as a database-administrator operation before
  applying application migrations with the application role.
- Good: run the complete migration chain twice after adding a later foreign key.
- Base: `/health/live` reports process liveness without dependency I/O.
- Bad: use separate Redis `EXISTS` and `SET` calls for a multi-key claim.
- Bad: return `encrypted_api_key_ref` from a dashboard-facing endpoint.
- Bad: make a domain package import Fastify, PostgreSQL, or Redis driver types.
- Bad: test only migration `0014`; cross-migration dependencies are missed.

### 6. Tests Required

- `npm run typecheck`, `npm run lint`, and `npm test`.
- API injection tests for liveness, readiness, validation, pagination,
  not-found responses, and metrics.
- `npm run test:api:integration` against real PostgreSQL and Redis, asserting:
  canonical event persistence/deduplication, multi-key Redis claims, token-safe
  lock release, migration version, and cleanup.
- Apply the complete ordered migration chain twice.
- `npm run db:verify` and `npm run db:verify:phase6a`.
- `docker compose -f infra/docker/compose.phase1.yml config`.
- Active Trellis task validation.

### 7. Wrong vs Correct

#### Wrong

```sql
-- A later FK remains while migration 0003 rebuilds this constraint.
ALTER TABLE agent_traces
DROP CONSTRAINT agent_traces_tenant_trace_uniq;
```

The second complete migration fails because the later foreign key depends on
the backing unique index.

#### Correct

```sql
ALTER TABLE IF EXISTS canonical_inbound_events
DROP CONSTRAINT IF EXISTS canonical_inbound_events_trace_fk;

ALTER TABLE agent_traces
DROP CONSTRAINT IF EXISTS agent_traces_tenant_trace_uniq;

-- Migration 0014 restores canonical_inbound_events_trace_fk.
```

The early migration can rebuild its owned constraint, and the later migration
re-establishes its own foreign key.
