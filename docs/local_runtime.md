# Local Runtime Foundation

Status: Phase 6B deployable Chatwoot and tenant-BYOK runtime
Scope: AgentOps API, PostgreSQL, Redis, Chatwoot, and LLM provider execution

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
`0001_phase1_foundation.sql` through `0015_chatwoot_llm_e2e.sql`.

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

Verify canonical execution state, persistent Chatwoot delivery attempts, mock
business records, and runtime execution audits with:

```bash
npm run db:verify:phase6b
```

Verify worker leases, monitor results, outbox triggers, and operational
aggregates with:

```bash
npm run db:verify:phase6d
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
POST http://localhost:8080/api/v1/chatwoot/agent-bot/:tenantId
POST http://localhost:8080/api/v1/chatwoot/webhooks/:tenantId
```

Readiness returns `503` until PostgreSQL, Redis, and migration version 16 are
available. The process handles `SIGINT` and `SIGTERM` by closing HTTP,
PostgreSQL, and Redis connections.

Run the asynchronous worker separately:

```bash
npm run start:worker
```

The runtime also requires:

- one active `chatwoot_connections` row whose secret fields are `env:NAME`
  references;
- one active immutable `tenant_model_configs` row;
- one active immutable `runtime_mode_configs` policy row;
- `AGENTOPS_MASTER_KEY` for decrypting the tenant BYOK reference;
- pricing for every configured fast, strong, and fallback model in
  `AGENTOPS_MODEL_PRICING_JSON`.

OpenAI-compatible providers use `/v1/chat/completions`. Anthropic uses
`/v1/messages`. Override provider origins with
`AGENTOPS_PROVIDER_BASE_URLS_JSON`.

## Local Chatwoot Expectations

Use a local Chatwoot instance from the official Chatwoot development or
self-hosted setup. Phase 6B requires:

- Chatwoot base URL, for example `http://localhost:3000`.
- Chatwoot account ID.
- Agent Bot config ID when Agent Bot is enabled.
- Account webhook secret reference.
- Chatwoot API token reference.

Secret values are represented by references in the AgentOps database. Plaintext
Chatwoot tokens and tenant provider keys must not be stored in database rows.

For local environment references, store:

```text
webhook_secret_ref = env:CHATWOOT_WEBHOOK_SECRET
api_token_ref      = env:CHATWOOT_API_TOKEN
```

The online flow persists and claims the canonical event before creating a
trace. Agent Bot and account webhook deliveries for the same Chatwoot message
share the canonical dedupe key and can seed only one pipeline execution.

## Verification And Live Smoke

The deterministic HTTP E2E starts local mock Provider and Chatwoot endpoints
while using the real PostgreSQL and Redis services:

```bash
npm run test:e2e
```

It covers PII masking, dual-entry dedupe, self-outgoing filtering,
Shadow/Assist/Auto side effects, Provider failure handoff, Chatwoot failure,
and persistent delivery retry claims.

Public service calls are opt-in. After configuring a real tenant, Chatwoot
connection, model config, and the smoke variables from `.env.example`, run:

```bash
npm run smoke:live
```

The command sends one signed customer event to the configured Agent Bot
endpoint. It does not create tenant or connection records.

## Phase Boundaries

Phase 6B provides real Chatwoot ingress/delivery and tenant BYOK model calls.
Dashboard UI, asynchronous worker consumption, and production reverse-proxy,
monitoring, backup, and runbook composition are owned by later Phase 6
subtasks. Billing, full RBAC, public accounts, and real commerce mutations
remain out of scope.

The original Phase 1A foundation does not implement those deferred product
features; later migrations and applications add only their explicitly owned
scope.
