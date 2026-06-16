# Phase 1A Database Verification

Date: 2026-06-17  
Branch: `feat/phase-1a-local-runtime-database-foundation`

## Tooling

`psql` was installed via Homebrew `libpq` and configured in `~/.zshrc`:

```text
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
```

Verified client:

```text
/opt/homebrew/opt/libpq/bin/psql
psql (PostgreSQL) 18.4
```

Verified server:

```text
PostgreSQL 16.14 on aarch64-unknown-linux-musl
```

## Runtime

Started local services with:

```bash
docker compose -f infra/docker/compose.phase1.yml up -d
```

Observed healthy containers:

```text
agentops-postgres   Up (healthy)   0.0.0.0:5432->5432/tcp
agentops-redis      Up (healthy)   0.0.0.0:6379->6379/tcp
```

## Migration

Applied migration:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/migrations/0001_phase1_foundation.sql
```

The migration completed successfully, then completed successfully a second
time to verify idempotency. The second run only emitted expected PostgreSQL
notices for existing extension, tables, indexes, and dropped/recreated
triggers.

## Created Tables

Live database table query returned exactly the Phase 1A scope:

```text
agent_traces
audit_logs
chatwoot_connections
llm_call_logs
tenant_model_configs
tenants
```

Constraint counts:

```text
agent_traces          7
audit_logs            4
chatwoot_connections  5
llm_call_logs         9
tenant_model_configs  8
tenants               4
```

## Smoke Test

A transaction inserted one row through the Phase 1A ownership chain:

- `tenants`
- `chatwoot_connections`
- `tenant_model_configs`
- `agent_traces`
- `llm_call_logs`
- `audit_logs`

Result:

```text
tenants_inserted               1
chatwoot_connections_inserted  1
model_configs_inserted         1
traces_inserted                1
llm_logs_inserted              1
audit_logs_inserted            1
```

The transaction ended with `ROLLBACK`, so no smoke-test records were persisted.
