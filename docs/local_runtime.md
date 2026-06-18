# Local Runtime Foundation

Status: Phase 1A foundation  
Scope: AgentOps API, PostgreSQL, Redis, and local Chatwoot expectations

## Runtime Components

Phase 1A keeps the runtime intentionally small:

- AgentOps API: future TypeScript service in `apps/api`.
- PostgreSQL: tenant config, Chatwoot connection config, traces, LLM logs, and
  audit logs.
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

The command applies `0001_phase1_foundation.sql`,
`0002_tenant_model_config_versions.sql`, and
`0003_llm_call_logging_cost_governance.sql`, and
`0004_pii_mask_trace_schema.sql`. The migrations create only the current
foundation tables:

- `tenants`
- `chatwoot_connections`
- `tenant_model_configs`
- `agent_traces`
- `llm_call_logs`
- `audit_logs`

It does not create RAG, tool, approval, eval, release gate, billing, RBAC, or
public user registration tables.

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
- Agent pipeline, RAG, tools, runtime modes, approval, eval, or release gates.
