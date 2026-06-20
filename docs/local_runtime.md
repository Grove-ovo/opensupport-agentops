# Local Runtime Foundation

Status: Phase 1A foundation  
Scope: AgentOps API, PostgreSQL, Redis, and local Chatwoot expectations

## Runtime Components

Phase 1A keeps the runtime intentionally small:

- AgentOps API: future TypeScript service in `apps/api`.
- PostgreSQL with pgvector: tenant config, policy corpus, traces, LLM logs,
  retrieval vectors, and audit logs.
- Redis: future dedupe TTLs, idempotency locks, async job coordination, and
  rate limiting.
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
`0001_phase1_foundation.sql` through `0013_failure_cases.sql`.

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

Phase 1A prepares the local runtime and database only. It does not implement:

- Chatwoot endpoint handlers or event dedupe logic.
- Tenant model config API routes.
- LLM provider calls.
- PII masking implementation.
- Dashboard UI, release deployment control, billing, RBAC, or public accounts.
