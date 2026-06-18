# Phase 1A Database Foundation

## Scenario: Local Runtime And Database Foundation

### 1. Scope / Trigger

- Trigger: Phase 1A changes include a PostgreSQL migration, Docker Compose
  runtime wiring, environment keys, and schema documentation.
- Applies to `infra/migrations/0001_phase1_foundation.sql`,
  `infra/docker/compose.phase1.yml`, `.env.example`,
  `docs/local_runtime.md`, and `docs/database_schema.md`.
- Does not authorize API handlers, RAG, tool execution, approval, eval, release
  gate, billing, RBAC, or public user registration implementation.

### 2. Signatures

Database migration:

```text
npm run db:migrate
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f infra/migrations/0001_phase1_foundation.sql \
  -f infra/migrations/0002_tenant_model_config_versions.sql \
  -f infra/migrations/0003_llm_call_logging_cost_governance.sql
```

Local services:

```text
npm run db:up
docker compose -f infra/docker/compose.phase1.yml up -d
docker compose -f infra/docker/compose.phase1.yml config
```

Validation:

```text
npm run test
npm run db:verify
node scripts/validate-phase1a.mjs
```

Phase 1A tables:

```text
tenants
chatwoot_connections
tenant_model_configs
agent_traces
llm_call_logs
audit_logs
```

### 3. Contracts

Environment keys:

| Key | Required | Contract |
|-----|----------|----------|
| `DATABASE_URL` | Yes | AgentOps PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `AGENTOPS_POSTGRES_USER` | Dev compose | Defaults to `agentops` |
| `AGENTOPS_POSTGRES_PASSWORD` | Dev compose | Defaults to `agentops` |
| `AGENTOPS_POSTGRES_DB` | Dev compose | Defaults to `agentops` |
| `AGENTOPS_POSTGRES_PORT` | Dev compose | Defaults to `5432` |
| `AGENTOPS_REDIS_PORT` | Dev compose | Defaults to `6379` |
| `AGENTOPS_MASTER_KEY` | Local MVP | Deployment-level local envelope encryption key |

Tooling contract:

- macOS local development uses Homebrew `libpq` for `psql`.
- `psql` must be available on `PATH`; for Homebrew Apple Silicon this is
  `/opt/homebrew/opt/libpq/bin`.
- `npm run db:migrate` must run with `ON_ERROR_STOP=1`.
- `npm run db:verify` must query the live PostgreSQL database and list public
  base tables.

Schema contracts:

- Tenant-scoped tables must include `tenant_id`.
- Tenant-scoped tables must reference `tenants(id)`.
- Secret fields must be references, such as `webhook_secret_ref`,
  `api_token_ref`, and `encrypted_api_key_ref`.
- `agent_traces` must include controlled launch version snapshot placeholders:
  `agent_version_id`, `prompt_version_id`, `policy_version_id`,
  `tool_manifest_version_id`, `risk_rule_version_id`,
  `retrieval_config_version_id`, and `model_config_version_id`.
- `llm_call_logs` must record provider, model, token, latency, cost, prompt
  version, error, and budget reason seed fields.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Required Phase 1A table missing | `scripts/validate-phase1a.mjs` fails |
| Tenant-scoped table missing `tenant_id` | `scripts/validate-phase1a.mjs` fails |
| Deferred table added to Phase 1A migration | `scripts/validate-phase1a.mjs` fails |
| Trace version snapshot field missing | `scripts/validate-phase1a.mjs` fails |
| Model config BYOK field missing | `scripts/validate-phase1a.mjs` fails |
| Compose syntax invalid | `docker compose ... config` fails |
| `psql` missing from `PATH` | `npm run db:migrate` and `npm run db:verify` fail |
| Migration SQL error | `npm run db:migrate` fails because `ON_ERROR_STOP=1` is set |
| Markdown or SQL has trailing whitespace in diff | `npm run lint` fails |

### 5. Good/Base/Bad Cases

- Good: add an index to `llm_call_logs` and update the schema doc plus
  validation when it changes a required contract.
- Base: add nullable metadata to a Phase 1A table when the field is only a
  placeholder for later implementation.
- Bad: create `users`, `approval_requests`, `tool_calls`, or
  `release_candidates` in Phase 1A.
- Bad: persist plaintext API keys or Chatwoot tokens in database rows.

### 6. Tests Required

- `npm run test` must assert:
  - all six Phase 1A tables exist in the migration;
  - tenant-scoped tables include `tenant_id`;
  - deferred tables are not created;
  - trace snapshot fields exist;
  - BYOK model config fields exist;
  - runtime docs mention the required local commands and env keys.
- `npm run lint` must run `git diff --check`.
- `npm run db:migrate` must apply `0001_phase1_foundation.sql` to a live local
  PostgreSQL database.
- `npm run db:verify` must show the six Phase 1A tables in `public`.
- `docker compose -f infra/docker/compose.phase1.yml config` must pass when
  compose files change.
- Trellis task validation must pass for the active task.

### 7. Wrong vs Correct

#### Wrong

```sql
CREATE TABLE IF NOT EXISTS tenant_model_configs (
  tenant_id uuid NOT NULL,
  api_key text NOT NULL
);
```

This stores a secret-bearing value and leaves tenant ownership unconstrained.

#### Correct

```sql
CREATE TABLE IF NOT EXISTS tenant_model_configs (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  encrypted_api_key_ref text NOT NULL
);
```

This preserves tenant ownership and stores only an encrypted key reference.
