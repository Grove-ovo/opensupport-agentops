# Real Postgres Redis Integration Test Profile

## Goal

Close the remaining P1 integration-skip gap by providing a reproducible command
profile that boots real local PostgreSQL/pgvector and Redis, applies the full
migration chain, runs API/worker/E2E integration tests with the correct
connection strings, and documents the flow for CI or staging operators.

## What I Already Know

- `reports/industrial_test_report_2026-07-06.md` lists "Integration skips" as a
  P1 improvement area.
- `npm test` currently skips three API integration/E2E tests and one worker
  integration test unless `AGENTOPS_RUN_INTEGRATION=1` is set.
- `package.json` already exposes `test:api:integration`,
  `test:worker:integration`, and `test:e2e`, but none of them starts
  PostgreSQL/Redis or guarantees migrations first.
- `infra/docker/compose.phase1.yml` starts PostgreSQL on localhost and Redis
  with `--requirepass ${AGENTOPS_REDIS_PASSWORD:-agentops}`.
- `docs/local_runtime.md` currently documents `REDIS_URL=redis://localhost:6379/0`,
  which is inconsistent with the default password-protected Redis compose
  service.

## Requirements

- Add a single command profile for real local integration tests against
  `infra/docker/compose.phase1.yml`.
- The command must:
  - validate Docker Compose configuration;
  - start PostgreSQL/pgvector and Redis;
  - wait for services using Compose health;
  - run the full migration chain before tests;
  - set `DATABASE_URL` and password-bearing `REDIS_URL` consistently;
  - run API integration, API E2E, and worker integration tests;
  - leave existing default `npm test` behavior unchanged.
- The profile must be safe to run repeatedly on a developer machine or staging
  runner and should avoid common local PostgreSQL/Redis ports by default.
- The profile should emit a machine-readable per-step summary with duration and
  zero-skipped evidence for CI/staging logs.
- Add focused tests for command construction, env contract, zero-skipped test
  enforcement, and failure behavior without requiring Docker in unit tests.
- Update docs so operators know when to run the default test suite versus the
  real integration profile.

## Acceptance Criteria

- [x] A committed `npm run test:integration:real` style command exists.
- [x] The command boots real PostgreSQL/Redis through Compose and runs the
      opt-in integration tests with `AGENTOPS_RUN_INTEGRATION=1`.
- [x] Redis URLs used by docs and scripts include the default compose password.
- [x] Unit tests cover the profile's command plan and environment shape without
      requiring live Docker.
- [x] A real local run proves the previously skipped API/worker integration
      tests execute against live PostgreSQL/Redis.
- [x] `npm run lint`, `npm run typecheck`, focused tests, and full `npm test`
      pass.

## Definition Of Done

- Work is committed in a coherent change.
- Trellis spec update is considered if a new command convention emerges.
- The task is archived and the session journal records the work.

## Technical Approach

Use a first-party Node orchestration script under `scripts/` rather than a shell
chain. A small library should build the command plan and environment so unit
tests can verify behavior without Docker. The CLI will execute the plan with
`spawnSync`, default to keeping services running after success for developer
reuse, and offer a flag/env option to tear the Compose services down for
ephemeral CI runners.

## Decision (ADR-lite)

**Context**: The project has real integration tests but no reproducible runtime
profile, so default test output hides coverage behind `SKIP` markers.

**Decision**: Add an explicit real integration profile rather than folding live
services into default `npm test`.

**Consequences**: The normal suite remains fast and deterministic, while
operators get a production-grade opt-in gate that proves storage and
coordination behavior against real services.

## Out Of Scope

- Live Chatwoot SaaS accounts or live LLM provider keys.
- Public internet capacity claims.
- Replacing the production Compose smoke/load gate.
- Making every default `npm test` run require Docker.

## Research References

- [`research/current-integration-gap.md`](research/current-integration-gap.md)
  - repository-local gap analysis for skipped integration tests and runtime
  wiring.

## Technical Notes

- Relevant specs:
  - `.trellis/spec/infra/phase-1a-database-foundation.md`
  - `.trellis/spec/infra/phase-6a-api-storage-runtime.md`
  - `.trellis/spec/infra/phase-6d-async-monitor-worker.md`
  - `.trellis/spec/integrations/phase-6b-chatwoot-llm-e2e.md`
- Likely files:
  - `package.json`
  - `scripts/*integration*.mjs`
  - `docs/local_runtime.md`
  - `reports/industrial_test_report_2026-07-06.md`
  - `apps/api/src/integration.test.ts`
  - `apps/api/src/e2e.test.ts`
  - `apps/worker/src/integration.test.ts`
