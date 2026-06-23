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
| [Phase 3D Approval Snapshots](./phase-3d-approval-snapshots.md) | Atomic pending approval creation and immutable evidence/tool/risk/version snapshots | Active |
| [Phase 3E Approval Actions](./phase-3e-approval-actions.md) | Terminal approval state machine, actor audit, guarded delivery, and edit distance | Active |
| [Phase 4D Release Candidate State Machine](./phase-4d-release-candidate-state-machine.md) | Immutable seven-version snapshots, exact Eval Runs, guarded promotion state, and audit | Active |
| [Phase 6A API And Storage Runtime](./phase-6a-api-storage-runtime.md) | Fastify composition, PostgreSQL repositories, Redis coordination, readiness, and migration idempotency | Active |
| [Phase 6D Async Monitor Worker](./phase-6d-async-monitor-worker.md) | PostgreSQL outbox, Redis Streams, durable leases, retries, DLQ, and async materialization | Active |
| [Phase 6E Production Operations](./phase-6e-production-operations.md) | Production images, Compose topology, secret files, observability, smoke tests, and operational recovery | Active |
| [Phase 6 Productization Integration](./phase-6-productization-integration.md) | Parent completion gate across archived child tasks, runnable applications, deployment assets, and aggregate validation | Active |
| [GitHub Release Readiness](./github-release-readiness.md) | Accurate repository entry docs, MIT license, CI quality chain, branch policy, and private publication | Active |
| [Phase 7A Operator Access](./phase-7a-operator-access.md) | OIDC PKCE, encrypted sessions, tenant claims, CSRF, and audit identity | Active |
| [Phase 7B Edge Transport](./phase-7b-edge-transport.md) | Nginx/Fastify request bounds, rate classes, proxy trust, and browser headers | Active |
| [Phase 7C Production Preflight](./phase-7c-production-preflight.md) | Fail-closed environment validation and secret-safe readiness reports | Active |
| [Phase 7D CI Security Supply Chain](./phase-7d-ci-security-supply-chain.md) | CI proves a running full stack, immutable image tags, time-bounded vulnerability gating, and SPDX SBOM evidence | Active |

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
- Read [Phase 4D Release Candidate State Machine](./phase-4d-release-candidate-state-machine.md)
  when changing release snapshots, candidate state, Eval Run scope, or
  transition persistence.
- Read [Phase 6A API And Storage Runtime](./phase-6a-api-storage-runtime.md)
  when changing API composition, PostgreSQL repositories, Redis dedupe/locks,
  readiness checks, migration markers, canonical events, or async outbox rows.
- Read [Phase 6D Async Monitor Worker](./phase-6d-async-monitor-worker.md)
  when changing outbox publication, Redis Streams, worker leases, retry/DLQ,
  monitor results, failure materialization, or dashboard aggregates.
- Read [Phase 6E Production Operations](./phase-6e-production-operations.md)
  when changing production images, Compose wiring, reverse-proxy routes,
  service metrics, structured logs, secrets, backups, or rollout procedures.
- Read [Phase 6 Productization Integration](./phase-6-productization-integration.md)
  when completing or reopening the Phase 6 parent task, changing child task
  boundaries, or changing the aggregate Phase 6 validation chain.
- Read [GitHub Release Readiness](./github-release-readiness.md) when changing
  repository entry documentation, CI, release branches, license, or remote
  publication.
- Read [Phase 7A Operator Access](./phase-7a-operator-access.md) when changing
  operator authentication, tenant authorization, session cookies, CSRF, or
  Dashboard identity state.
- Read [Phase 7B Edge Transport](./phase-7b-edge-transport.md) when changing
  Nginx, public proxy headers, rate limits, body/header bounds, or HTTP
  timeouts.
- Read [Phase 7C Production Preflight](./phase-7c-production-preflight.md) when
  changing production environment keys, secret files, deployment gates, or
  readiness evidence.
- Read [Phase 7D CI Security Supply Chain](./phase-7d-ci-security-supply-chain.md)
  when changing the GitHub CI workflow, the CI full-stack boot, image
  scanning/SBOM jobs, ephemeral CI configuration generation, or the Trivy
  vulnerability allowlist.
- Confirm whether the change belongs to the active Trellis phase.
- Search existing migrations and docs before adding duplicate table or env names.
- Keep secret-bearing values as references, not plaintext persisted values.

## Quality Check

Before completing infra work:

- Run `npm run test`.
- Run `npm run lint`.
- Run `docker compose -f infra/docker/compose.phase1.yml config` when compose is touched.
- Run the active Trellis task validation command.
