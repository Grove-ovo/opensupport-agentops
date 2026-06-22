# Phase 6: Productization And Real End-to-End

## Goal

Turn the Phase 1-5 deterministic reference implementation into a deployable
AgentOps application with real HTTP processes, PostgreSQL and Redis adapters,
Chatwoot and LLM provider integration, an operator dashboard, an asynchronous
monitor worker, and production deployment and observability assets.

## Requirements

- Provide separately runnable `api`, `web`, and `worker` applications.
- PostgreSQL is the authoritative store for tenant configuration, inbound
  events, traces, approvals, release candidates, failure cases, and audit data.
- Redis provides canonical-event dedupe, idempotency locks, rate limits, cache,
  and durable asynchronous job coordination.
- Expose health, readiness, metrics, tenant configuration, trace, approval,
  release, and Chatwoot integration APIs.
- Run the existing PII, agent, risk, runtime-mode, approval, eval, and release
  contracts through production adapters rather than duplicating domain logic.
- Support real Chatwoot Agent Bot/account webhook input and Chatwoot outbound
  reply, private-note, assignment, and status operations.
- Support real tenant BYOK calls through provider adapters while keeping
  provider payloads and secrets behind integration boundaries.
- Provide an operator dashboard for overview, traces, approvals, release
  candidates, and tenant/model configuration.
- Run Monitor Agent failure classification, eval materialization, and
  dashboard aggregation outside the online request path.
- Provide production Docker images, Compose deployment, reverse-proxy routing,
  metrics, structured logs, health probes, backup/restore guidance, secret
  handling guidance, and rollback instructions.

## Subtasks

1. Phase 6A: Deployable API, PostgreSQL, and Redis runtime.
2. Phase 6B: Real Chatwoot and LLM provider end-to-end flow.
3. Phase 6C: Operations dashboard, approvals, and release management UI.
4. Phase 6D: Asynchronous Monitor Worker.
5. Phase 6E: Production deployment, monitoring, and operations.

Each subtask must pass `trellis-check`, be committed independently, and be
archived with `trellis-finish-work` before the next subtask begins.

## Acceptance Criteria

- [x] A clean environment can start the full stack from documented commands.
- [x] API readiness fails when required PostgreSQL or Redis dependencies are
      unavailable and succeeds when migrations and dependencies are ready.
- [x] Duplicate Agent Bot/account webhook delivery creates one canonical
      execution.
- [x] A configured tenant can invoke at least one real supported LLM provider
      and deliver the resulting mode-controlled action through Chatwoot.
- [x] Provider, Chatwoot, approval, release, and worker side effects are
      idempotent and auditable.
- [x] Dashboard users can inspect traces and complete approval and release
      workflows through the API.
- [x] Monitor jobs retry safely, move exhausted work to a dead-letter stream,
      and do not block the customer response path.
- [x] Prometheus-compatible metrics, structured logs, health probes, and
      operational runbooks are present.
- [x] Unit, integration, type-check, lint, migration, Compose, and browser
      verification pass.

## Definition Of Done

- [x] Every child task is implemented, checked, committed, and archived.
- [x] `npm run typecheck`, `npm run lint`, and the complete test suite pass.
- [x] Database migrations run against PostgreSQL and Redis-backed integration tests
  pass.
- [x] Production Compose configuration validates and its services become healthy.
- [x] Dashboard is checked at desktop and mobile widths with no broken workflows.
- [x] README and architecture/runbook documentation match the executable system.

## Verification

Verified on June 22, 2026:

- Phase 6A through 6E were independently checked, committed, archived, and
  merged through feature branches into `dev`.
- The production Compose stack remained healthy with migration version 16,
  API/worker readiness, two healthy Prometheus targets, and provisioned
  Grafana dashboards.
- A signed Chatwoot production smoke invoked a tenant BYOK-compatible provider,
  persisted the trace and runtime audit, delivered the reply, completed async
  monitor/aggregation jobs, and exposed the result in the Dashboard.
- Full unit/report tests, PostgreSQL/Redis integrations, browser tests,
  dependency audit, all image builds, backup/restore dry-runs, and clean
  migration replay passed.

## Technical Approach

- Fastify application factory and plugins for the TypeScript API.
- `pg` connection pools and explicit repositories; SQL remains migration-owned.
- `node-redis` for dedupe, locks, caching, and Redis Streams worker queues.
- React and Vite for the operator dashboard, served as static production assets.
- Provider-specific adapters implement project-owned LLM interfaces.
- API and worker share composition modules but run as independent processes.
- Prometheus text metrics and JSON logs are exposed without coupling domain
  packages to transport or monitoring libraries.

## Decision (ADR-lite)

**Context**: Phase 1-5 intentionally kept network and persistence effects behind
deterministic interfaces. Productization now requires real adapters without
weakening replayability or controlled-launch behavior.

**Decision**: Keep existing domain packages authoritative. Add explicit
application composition, repository, provider, HTTP, UI, worker, and deployment
layers around them. PostgreSQL remains authoritative; Redis coordinates
ephemeral and asynchronous work.

**Consequences**: The deployment gains more moving parts and integration tests,
but state ownership, idempotency, auditability, and rollback boundaries remain
clear.

## Out Of Scope

- Public user registration, billing, or a complete SaaS identity platform.
- Real Shopify, WooCommerce, Taobao, or JD mutation adapters.
- Kubernetes manifests or cloud-provider-specific infrastructure.
- Replacing the existing PostgreSQL FTS plus pgvector retrieval direction.
- Replacing the application state machines with an external workflow engine.

## Technical Notes

- `apps/api`, `apps/web`, and `apps/worker` are independently runnable
  application boundaries.
- Existing domain packages remain authoritative; production adapters preserve
  their public semantics.
- Migrations through `0016` define the current production schema.
- Frontend, integration, worker, and production operations contracts are
  captured in `.trellis/spec/`.
- Research summary: `research/productization-stack.md`.
