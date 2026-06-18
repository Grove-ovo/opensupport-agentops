# Technical Design: Phase 1 Foundation Integration

Status: Implemented and verified
Date: 2026-06-18
Source PRD: `OpenSupport_AgentOps_PRD.md`

## Integration Boundary

This task verifies the completed Phase 1A-1E foundation as one baseline. It
does not add Agent runtime behavior. The integration layer is intentionally a
repository validation command plus full quality and database checks.

## Final Phase 1 Components

### Runtime and Database

- Docker Compose: `infra/docker/compose.phase1.yml`
- Canonical database: PostgreSQL with pgvector
- Environment switch: `DATABASE_URL`
- Ordered migrations:
  1. `0001_phase1_foundation.sql`
  2. `0002_tenant_model_config_versions.sql`
  3. `0003_llm_call_logging_cost_governance.sql`
  4. `0004_pii_mask_trace_schema.sql`

The migration chain is idempotent and preserves one schema across local and
managed PostgreSQL environments.

### Chatwoot Connector

Package: `packages/chatwoot`

- Agent Bot and account webhook endpoints share canonical normalization.
- Signatures are verified before acceptance.
- Self-outgoing events cannot seed future execution.
- Fallback identity is based on tenant, conversation, message, and event type.
- Cross-entry duplicates converge on one pipeline seed.

### Tenant Model Config and BYOK

Package: `packages/model-config`

- Configuration is tenant-scoped and versioned.
- Provider credentials are represented through encrypted references.
- Envelope encryption is the Phase 1 storage strategy.
- Model roles, timeout, fallback, ticket budget, and daily budget are fixed
  contract fields.
- Config versions are immutable after creation.

### LLM Observability

Package: `packages/llm-observability`

- Logs include model/provider, prompt version, latency, token counts, estimated
  cost, error code, and governance reason.
- Costs use currency-safe decimal handling in PostgreSQL.
- The module records budget decisions but does not implement full runtime mode
  transitions.

### PII and Trace

Packages: `packages/pii`, `packages/trace`

- PII categories: phone, email, address, government ID, and bank card.
- Order identifiers remain available for customer-support workflows.
- PII masking is designed to run before provider invocation.
- Trace creation freezes these version identities:
  - `agent_version_id`
  - `prompt_version_id`
  - `policy_version_id`
  - `tool_manifest_version_id`
  - `risk_rule_version_id`
  - `retrieval_config_version_id`
  - `model_config_version_id`
- PostgreSQL constraints and application guards reject cross-tenant snapshot
  references.

## Parent Integration Validator

Add `scripts/validate-phase1.mjs` and expose it as `npm run test:phase1`.

The validator must fail when:

- a required Phase 1 migration, package, document, verification script, or
  child archive is missing
- `db:migrate` omits or reorders Phase 1 migrations
- the root `test` command omits a Phase 1 static or package suite
- a child task is not archived with `status=completed`
- the parent PRD loses the Phase 1 scope boundary

The validator is a repository consistency check. Runtime behavior continues to
be tested by package tests and PostgreSQL verification SQL.

## Validation Commands

```bash
npm run lint
npm run typecheck
npm test
docker compose -f infra/docker/compose.phase1.yml config
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:migrate
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:verify
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:verify:model-config
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:verify:llm-observability
PATH="/opt/homebrew/opt/libpq/bin:$PATH" npm run db:verify:trace
python3 ./.trellis/scripts/task.py validate 06-16-opensupport-agentops-architecture
```

## Deferred Work

- RAG, Agent pipeline, tools, runtime modes, approvals
- eval, release gates, benchmark/load testing
- dashboard UI
- user registration and complete SaaS account/RBAC
- real ecommerce adapters
- external secret manager and workflow engine

## References

- `docs/architecture.md`
- `docs/adr/ADR-001-opensupport-agentops-mvp-architecture.md`
- `docs/adr/ADR-002-controlled-launch-architecture.md`
- `.trellis/spec/infra/phase-1a-database-foundation.md`
- `.trellis/spec/integrations/chatwoot-connector.md`
- `.trellis/spec/infra/phase-1c-tenant-model-config.md`
- `.trellis/spec/infra/phase-1d-llm-observability.md`
- `.trellis/spec/infra/phase-1e-pii-trace.md`
- `.trellis/spec/infra/phase-1-foundation-integration.md`
