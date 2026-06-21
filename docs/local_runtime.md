# Local Runtime Foundation

Status: Phase 6A deployable runtime
Scope: AgentOps API, PostgreSQL, Redis, and local Chatwoot expectations

## Runtime Components

The local runtime contains:

- AgentOps API: Fastify TypeScript service in `apps/api`.
- PostgreSQL with pgvector: tenant config, policy corpus, traces, LLM logs,
  retrieval vectors, and audit logs.
- Redis: canonical-event dedupe TTLs, idempotency locks, and the coordination
  base for later async jobs and rate limiting.
- Chatwoot: local/self-hosted Chatwoot instance used as the conversation
  surface. AgentOps does not own user-facing inbox UI.

AgentOps and Chatwoot can share local infrastructure during development, but
their schemas must remain separate. The Phase 1A migration is only for the
AgentOps database.

## Local Services

The repository includes a PostgreSQL and Redis dev compose file:

```bash
npm run db:up
```

Expected defaults:

```text
PostgreSQL: localhost:5432
Redis:      localhost:6379
Database:   agentops
User:       agentops
Password:   agentops
```

The matching application connection strings live in `.env.example`:

```text
DATABASE_URL=postgresql://agentops:agentops@localhost:5432/agentops
REDIS_URL=redis://localhost:6379/0
```

## Applying Phase 1 Migrations

Install the PostgreSQL client with Homebrew on macOS:

```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
```

Open a new terminal, or run this in the current shell:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
```

After PostgreSQL is running, apply the ordered Phase 1 migrations with:

```bash
npm run db:migrate
```

The command applies the complete ordered migration chain from
`0001_phase1_foundation.sql` through `0014_productization_runtime.sql`.

Production-style environments can run the same ordered chain without `psql`:

```bash
npm run db:migrate:node
```

Phase 2C uses the `pgvector/pgvector:pg16` image. If the local PostgreSQL
container predates Phase 2C, recreate that service before migration:

```bash
docker compose -f infra/docker/compose.phase1.yml up -d --force-recreate postgres
```

The migrations create the foundation, retrieval, runtime, approval, eval,
release-gate, and failure-analysis tables. The Phase 4A additions are:

- `eval_cases`
- `security_eval_cases`
- `eval_runs`
- `eval_case_results`

Later Phase 4 migrations add release candidates, release-gate decisions, and
safe failure records. The chain does not create billing, full RBAC, or public
user registration tables.

Verify the live database table list with:

```bash
npm run db:verify
```

Verify Phase 1D append-only logging, tenant ownership, generated token totals,
and currency-safe reporting with:

```bash
npm run db:verify:llm-observability
```

Verify Phase 1E tenant-consistent model snapshots, immutable trace fields, PII
audit metadata, and operational trace updates with:

```bash
npm run db:verify:trace
```

Verify pgvector, tenant isolation, policy immutability, embedding dimensions,
and active retrieval config rules with:

```bash
npm run db:verify:retrieval
```

Verify immutable evaluation case, run, and result persistence with:

```bash
npm run db:verify:eval
```

Verify the schema migration marker, canonical inbound event uniqueness, async
outbox, and operational aggregate tables with:

```bash
npm run db:verify:phase6a
```

## Running The API

After migrations are applied:

```bash
npm run start:api
```

The default endpoints are:

```text
GET http://localhost:8080/health/live
GET http://localhost:8080/health/ready
GET http://localhost:8080/metrics
GET http://localhost:8080/api/v1/tenants
```

Readiness returns `503` until PostgreSQL, Redis, and migration version 14 are
available. The process handles `SIGINT` and `SIGTERM` by closing HTTP,
PostgreSQL, and Redis connections.

## Local Chatwoot Expectations

Use a local Chatwoot instance from the official Chatwoot development or
self-hosted setup. For Phase 1A, AgentOps only needs the following values:

- Chatwoot base URL, for example `http://localhost:3000`.
- Chatwoot account ID.
- Agent Bot config ID when Agent Bot is enabled.
- Account webhook secret reference.
- Chatwoot API token reference.

Secret values are represented by references in the AgentOps database. Plaintext
Chatwoot tokens and tenant provider keys must not be stored in database rows.

## Phase Boundaries

Phase 6A provides the deployable API and storage foundation. Real Chatwoot
delivery and LLM provider calls, dashboard UI, asynchronous worker consumption,
and production reverse-proxy/monitoring composition are owned by later Phase 6
subtasks. Phase 6A does not implement those features. Billing, full RBAC, and
public accounts remain out of scope.
