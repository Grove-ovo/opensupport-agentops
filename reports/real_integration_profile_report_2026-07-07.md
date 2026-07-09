# Real Integration Profile Report - 2026-07-07

## Scope

This report records the real local PostgreSQL/pgvector and Redis integration
profile added for OpenSupport AgentOps. It closes the earlier P1 gap where API
and worker integration tests existed but were skipped by the default
Docker-free test suite.

This is local/staging integration evidence. It does not use live Chatwoot SaaS
or live LLM provider credentials, and it is not a public internet capacity
claim.

## Command

```sh
npm run test:integration:real
```

The profile:

- validates `infra/docker/compose.phase1.yml`;
- starts PostgreSQL/pgvector and Redis with Compose health checks;
- binds PostgreSQL to `127.0.0.1:55432` and Redis to `127.0.0.1:56379`;
- applies the complete migration chain through `0016_async_monitor_worker.sql`;
- runs API integration, deterministic API E2E, and worker integration tests
  with `AGENTOPS_RUN_INTEGRATION=1`;
- fails closed if any integration step reports skipped tests or omits the TAP
  skipped summary.

## Real Run Result

| Gate | Result |
|---|---|
| Compose config | Passed |
| Compose health | Passed: PostgreSQL and Redis healthy |
| Migration chain | Passed: `0001` through `0016` applied |
| API integration | Passed: 21 tests, 0 skipped |
| API E2E | Passed: 2 tests, 0 skipped |
| Worker integration | Passed: 6 tests, 0 skipped |

Latest `--down` CLI summary:

```json
{
  "status": "passed",
  "steps": [
    "compose_config",
    "compose_up",
    "migrate",
    "api_integration",
    "api_e2e",
    "worker_integration",
    "compose_down"
  ],
  "step_results": [
    {
      "id": "compose_config",
      "status": "passed",
      "duration_ms": 39
    },
    {
      "id": "compose_up",
      "status": "passed",
      "duration_ms": 10675
    },
    {
      "id": "migrate",
      "status": "passed",
      "duration_ms": 308
    },
    {
      "id": "api_integration",
      "status": "passed",
      "duration_ms": 1757,
      "skipped_tests": 0
    },
    {
      "id": "api_e2e",
      "status": "passed",
      "duration_ms": 1058,
      "skipped_tests": 0
    },
    {
      "id": "worker_integration",
      "status": "passed",
      "duration_ms": 2005,
      "skipped_tests": 0
    },
    {
      "id": "compose_down",
      "status": "passed",
      "duration_ms": 558
    }
  ],
  "services_left_running": false
}
```

## Regression Gates

| Gate | Result |
|---|---|
| `node --test scripts/real-integration.test.mjs` | Passed: 11 tests |
| `npm run test:phase6a` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test:integration:real -- --down` | Passed; zero skipped asserted and services stopped |
| `npm run test:integration:real -- --skip-compose-up --down` | Passed; services stopped without dropping volumes |
| `npm test` | Passed |
| `python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-07-real-integration-test-profile` | Passed |

## Findings

- The first real run found a host port collision on `5432`; the profile now
  defaults to high ports `55432` and `56379`.
- The first real run found a worker integration isolation bug: API/E2E tests
  can create unrelated async outbox rows before worker integration runs. The
  worker test now asserts tenant-scoped durable outcomes instead of assuming an
  empty global queue.
- Redis URLs in `.env.example`, docs, and integration fallbacks now include the
  default Compose password.

## Follow-Up

The services remain running by default for local reuse. Ephemeral runners can
use:

```sh
npm run test:integration:real -- --down
```

The CI/staging cleanup variant was also exercised with pre-running services:

```sh
npm run test:integration:real -- --skip-compose-up --down
```
