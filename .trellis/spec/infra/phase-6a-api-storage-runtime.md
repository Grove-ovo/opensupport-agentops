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
npm run test:integration:real

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
- `npm run test:integration:real` starts real local PostgreSQL/pgvector and
  Redis, applies migrations, and runs API integration, API E2E, and worker
  integration tests with no skipped live-service cases.
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

## Scenario: Real PostgreSQL/Redis Integration Profile

### 1. Scope / Trigger

- Trigger: adding or changing a command that orchestrates real local
  PostgreSQL/pgvector and Redis integration tests.
- Applies to `scripts/run-real-integration.mjs`,
  `scripts/real-integration-lib.mjs`, `scripts/real-integration.test.mjs`,
  `package.json`, `.env.example`, `docs/local_runtime.md`, API integration
  tests, and worker integration tests.

### 2. Signatures

```text
npm run test:integration:real
node scripts/run-real-integration.mjs [--down] [--down-volumes] [--skip-compose-up]
```

```js
buildRealIntegrationEnvironment(env, options)
buildRealIntegrationPlan(options)
runCommandPlan(steps, options)
```

### 3. Contracts

- The real profile validates `infra/docker/compose.phase1.yml`, starts
  PostgreSQL/pgvector and Redis with Compose health checks, applies the full
  migration chain with `npm run db:migrate:node`, then runs
  `test:api:integration`, `test:e2e`, and `test:worker:integration`.
- The successful CLI summary includes `steps`, `step_results`, and
  `services_left_running`. Each `step_results` item includes `id`, `status`,
  and `duration_ms`; integration-test steps also include `skipped_tests`.
- Default profile ports are high local ports to avoid common developer
  collisions:
  - `DATABASE_URL=postgresql://agentops:agentops@127.0.0.1:55432/agentops`
  - `REDIS_URL=redis://:agentops@127.0.0.1:56379/0`
- Existing compose env keys override credentials and ports:
  `AGENTOPS_POSTGRES_USER`, `AGENTOPS_POSTGRES_PASSWORD`,
  `AGENTOPS_POSTGRES_DB`, `AGENTOPS_POSTGRES_PORT`,
  `AGENTOPS_REDIS_PASSWORD`, and `AGENTOPS_REDIS_PORT`.
- The command sets `AGENTOPS_RUN_INTEGRATION=1`; default `npm test` remains
  Docker-free and may keep live-service tests skipped.
- The profile leaves services running by default for local reuse. `--down`
  tears services down, and `--down-volumes` also removes volumes for ephemeral
  CI/staging runs.
- Worker integration tests must not assume the shared database has an empty
  async outbox. They must assert tenant-scoped durable outcomes and tolerate
  unrelated pending outbox rows from preceding API/E2E integration tests.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Compose config invalid | `real_integration_failed:compose_config` |
| PostgreSQL or Redis fails health | `real_integration_failed:compose_up` |
| Migration chain fails | `real_integration_failed:migrate` |
| API integration fails | `real_integration_failed:api_integration` |
| API E2E fails | `real_integration_failed:api_e2e` |
| Worker integration fails | `real_integration_failed:worker_integration` |
| Any integration step reports skipped tests | Fails the owning step with skipped test detail |
| Any integration step lacks a TAP skipped summary | Fails the owning step closed |
| Standard port already occupied | Default profile still uses high ports |
| Unknown CLI flag | Stable `real_integration_failed:unknown_cli_argument` |

### 5. Good/Base/Bad Cases

- Good: run `npm run test:integration:real` on a developer machine that already
  has PostgreSQL on `5432`; the profile binds Compose PostgreSQL to `55432` and
  Redis to `56379`.
- Base: run `npm run test:integration:real -- --skip-compose-up` when a staging
  runner manages the services separately but uses the same env contract.
- Bad: set only `AGENTOPS_RUN_INTEGRATION=1` and rely on implicit Redis
  defaults; the compose Redis requires a password-bearing URL.
- Bad: worker integration asserts global queue emptiness; real profiles may
  run after API/E2E tests that create unrelated async outbox rows.

### 6. Tests Required

- Unit: command plan order, env URL construction, high-port defaults,
  `--skip-compose-up`, teardown command construction, first-failure stopping
  behavior, per-step machine summary shape, and zero-skipped TAP summary
  enforcement.
- Real integration: run `npm run test:integration:real` and verify API
  integration, API E2E, and worker integration report zero skipped live-service
  tests.
- Regression: `npm run test:phase6a`, `npm run lint`, `npm run typecheck`, and
  full `npm test`.

### 7. Wrong vs Correct

#### Wrong

```sh
AGENTOPS_RUN_INTEGRATION=1 npm run test:worker
# Falls back to redis://localhost:6379/0 and assumes the database queue is empty.
```

#### Correct

```sh
npm run test:integration:real
# Uses password-bearing Redis URL, high host ports, migrations first, and
# tenant-scoped worker assertions.
```
