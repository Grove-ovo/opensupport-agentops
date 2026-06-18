# Infra Guidelines

> Implementation contracts for local runtime, database migrations, and
> environment wiring.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Phase 1A Database Foundation](./phase-1a-database-foundation.md) | Local runtime, migration, env, and validation contracts for the Phase 1A foundation | Active |
| [Phase 1C Tenant Model Config](./phase-1c-tenant-model-config.md) | Versioned BYOK config, envelope encryption, validation, and database constraints | Active |
| [Phase 1D LLM Observability](./phase-1d-llm-observability.md) | Immutable LLM call logs, micro-unit cost calculation, projected budgets, and reporting views | Active |

## Pre-Development Checklist

Before changing infra, database, or local runtime files:

- Read [Phase 1A Database Foundation](./phase-1a-database-foundation.md).
- Read [Phase 1C Tenant Model Config](./phase-1c-tenant-model-config.md) when
  changing model configuration or BYOK secret handling.
- Read [Phase 1D LLM Observability](./phase-1d-llm-observability.md) when
  changing LLM call logs, pricing snapshots, budget decisions, or cost views.
- Confirm whether the change belongs to the active Trellis phase.
- Search existing migrations and docs before adding duplicate table or env names.
- Keep secret-bearing values as references, not plaintext persisted values.

## Quality Check

Before completing infra work:

- Run `npm run test`.
- Run `npm run lint`.
- Run `docker compose -f infra/docker/compose.phase1.yml config` when compose is touched.
- Run the active Trellis task validation command.
