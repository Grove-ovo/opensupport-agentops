# Phase 6A: Deployable API, PostgreSQL, And Redis Runtime

## Goal

Create the production application foundation: a runnable TypeScript API,
environment validation, PostgreSQL and Redis lifecycle management, explicit
repositories, migrations, health/readiness/metrics endpoints, and integration
tests.

## Requirements

- Add an `apps/api` workspace with an application factory and process entrypoint.
- Validate runtime configuration before opening network listeners.
- Manage PostgreSQL and Redis connections with startup checks and graceful
  shutdown.
- Add migration `0014` for canonical inbound events, queue outbox records, and
  operational aggregation state required by later Phase 6 tasks.
- Implement repositories for tenants, Chatwoot connections, model config
  versions, traces, approvals, release candidates, and canonical events.
- Expose `/health/live`, `/health/ready`, `/metrics`, and versioned operator API
  read endpoints.
- Use Redis for canonical-event dedupe and short idempotency locks.
- Return stable error envelopes and correlation IDs.
- Keep Fastify, `pg`, and Redis types outside domain packages.

## Acceptance Criteria

- [ ] API starts with valid configuration and shuts down cleanly.
- [ ] Readiness checks PostgreSQL, Redis, and migration version.
- [ ] Replaying a canonical event dedupe key returns the stored execution seed.
- [ ] Repository integration tests run against real PostgreSQL and Redis.
- [ ] API injection tests cover success, validation, not-found, and unavailable
      dependency cases.
- [ ] `npm run typecheck`, `npm run lint`, complete tests, migration verification,
      and Trellis validation pass.

## Out Of Scope

- Real Chatwoot delivery and real provider calls.
- Dashboard assets.
- Worker job consumption.
- Production reverse proxy and deployment images.

## Technical Notes

- Parent design:
  `../06-20-phase-6-productization-real-e2e/info.md`.
- Preserve migration ordering and SQL ownership.

