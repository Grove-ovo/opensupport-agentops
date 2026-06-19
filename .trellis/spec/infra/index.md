# Infra Guidelines

> Implementation contracts for local runtime, database migrations, and
> environment wiring.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Phase 1A Database Foundation](./phase-1a-database-foundation.md) | Local runtime, migration, env, and validation contracts for the Phase 1A foundation | Active |
| [Phase 1C Tenant Model Config](./phase-1c-tenant-model-config.md) | Versioned BYOK config, envelope encryption, validation, and database constraints | Active |
| [Phase 1D LLM Observability](./phase-1d-llm-observability.md) | Immutable LLM call logs, micro-unit cost calculation, projected budgets, and reporting views | Active |
| [Phase 1E PII And Trace](./phase-1e-pii-trace.md) | Deterministic PII masking, immutable trace snapshots, and execution-state schema seed | Active |
| [Phase 1 Foundation Integration](./phase-1-foundation-integration.md) | Repository-level acceptance gate for migrations, tests, docs, packages, and Trellis child records | Active |
| [Phase 2C Policy Retrieval](./phase-2c-policy-retrieval.md) | Immutable tenant policy corpus, deterministic ingestion, PostgreSQL FTS, and pgvector candidate retrieval | Active |
| [Phase 3A Ticket Execution State Machine](./phase-3a-ticket-execution-state-machine.md) | Guarded expected-state transitions, idempotency, append-only audit, and PostgreSQL enforcement | Active |
| [Phase 3B Runtime Mode Decision](./phase-3b-runtime-mode-decision.md) | Versioned Auto policy, deterministic requested/effective mode decisions, and downgrade reasons | Active |

## Pre-Development Checklist

Before changing infra, database, or local runtime files:

- Read [Phase 1A Database Foundation](./phase-1a-database-foundation.md).
- Read [Phase 1C Tenant Model Config](./phase-1c-tenant-model-config.md) when
  changing model configuration or BYOK secret handling.
- Read [Phase 1D LLM Observability](./phase-1d-llm-observability.md) when
  changing LLM call logs, pricing snapshots, budget decisions, or cost views.
- Read [Phase 1E PII And Trace](./phase-1e-pii-trace.md) when changing
  provider-bound masking, trace contracts, execution states, or trace storage.
- Read [Phase 1 Foundation Integration](./phase-1-foundation-integration.md)
  when adding, renaming, removing, or reordering a Phase 1 artifact.
- Read [Phase 2C Policy Retrieval](./phase-2c-policy-retrieval.md) when changing
  policy versions, document ingestion, embeddings, or candidate retrieval.
- Read [Phase 3A Ticket Execution State Machine](./phase-3a-ticket-execution-state-machine.md)
  when changing execution states, transition reasons, idempotency, or
  transition persistence.
- Read [Phase 3B Runtime Mode Decision](./phase-3b-runtime-mode-decision.md)
  when changing Auto eligibility, downgrade policy, runtime config, or mode
  decision records.
- Confirm whether the change belongs to the active Trellis phase.
- Search existing migrations and docs before adding duplicate table or env names.
- Keep secret-bearing values as references, not plaintext persisted values.

## Quality Check

Before completing infra work:

- Run `npm run test`.
- Run `npm run lint`.
- Run `docker compose -f infra/docker/compose.phase1.yml config` when compose is touched.
- Run the active Trellis task validation command.
