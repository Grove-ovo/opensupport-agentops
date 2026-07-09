# Current Integration Gap

## Findings

- The full repository test suite currently reports skipped integration tests:
  - API: `Chatwoot ingress executes masked provider calls across Shadow Assist
    and Auto`
  - API: `AC-08 records cost_cap_exceeded in trace when ticket cost exceeds the
    cap`
  - API: `PostgreSQL repositories and Redis coordination use real services`
  - Worker: `PostgreSQL outbox flows through Redis Streams into durable worker
    results`
- These tests opt in through `AGENTOPS_RUN_INTEGRATION=1`.
- Existing scripts only set that flag:
  - `test:api:integration`
  - `test:e2e`
  - `test:worker:integration`
- No committed command currently starts `infra/docker/compose.phase1.yml`, waits
  for health, applies the complete migration chain, and then runs all integration
  tests.
- `infra/docker/compose.phase1.yml` protects Redis with
  `--requirepass ${AGENTOPS_REDIS_PASSWORD:-agentops}`.
- Existing test defaults and `docs/local_runtime.md` use
  `redis://localhost:6379/0`, which fails against the default password-protected
  compose Redis.

## Recommended MVP

Add a Node CLI with a small testable library:

- `scripts/run-real-integration.mjs`
- `scripts/real-integration-lib.mjs`
- `scripts/real-integration.test.mjs`

The CLI should run:

1. `docker compose -f infra/docker/compose.phase1.yml config`
2. `docker compose -f infra/docker/compose.phase1.yml up -d --wait`
3. `npm run db:migrate:node`
4. `npm run test:api:integration`
5. `npm run test:e2e`
6. `npm run test:worker:integration`

with:

```text
DATABASE_URL=postgresql://agentops:agentops@127.0.0.1:55432/agentops
REDIS_URL=redis://:agentops@127.0.0.1:56379/0
AGENTOPS_RUN_INTEGRATION=1
```

Support configurable ports/passwords through existing compose env keys:

```text
AGENTOPS_POSTGRES_USER
AGENTOPS_POSTGRES_PASSWORD
AGENTOPS_POSTGRES_DB
AGENTOPS_POSTGRES_PORT
AGENTOPS_REDIS_PASSWORD
AGENTOPS_REDIS_PORT
```

The profile should default to high host ports (`55432` and `56379`) to avoid
colliding with developer machines that already run PostgreSQL or Redis on the
standard ports.

## Constraints

- Default `npm test` should stay Docker-free and deterministic.
- Unit tests for the orchestration plan must not require Docker.
- The real profile may require Docker and will be run explicitly in local
  validation or staging.
- Reports/docs should call this a local/staging integration gate, not a public
  capacity or live-provider proof.
