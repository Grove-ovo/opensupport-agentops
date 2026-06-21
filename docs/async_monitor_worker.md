# Asynchronous Monitor Worker

Phase 6D runs monitoring, failure materialization, and dashboard aggregation
outside the Chatwoot response path.

## Delivery Flow

1. PostgreSQL triggers append identifier-only records to `async_job_outbox`
   when a runtime audit or release gate result commits.
2. The worker relays pending rows to Redis Streams with one Lua operation that
   atomically checks the dedupe marker, appends the message, and stores the
   stream ID.
3. A Redis consumer group reads new messages and reclaims stale pending
   messages with `XAUTOCLAIM`.
4. PostgreSQL `async_job_executions` provides a durable lease and idempotency
   record for every outbox ID.
5. The worker acknowledges a stream message only after the handler output and
   succeeded execution state commit.
6. Failures are retried with a bounded attempt count. Exhausted jobs are
   written to the dead-letter stream with IDs, type, attempt, and error code
   only.

## Handlers

- `monitor_trace` writes deterministic `monitor_trace_results`.
- `materialize_eval` inserts safe, append-only `failure_cases` from immutable
  eval and release-gate references.
- `aggregate_dashboard` writes the latest 24-hour summary to
  `operational_aggregates`. Dashboard reads use this materialized record and do
  not execute live aggregation queries.

## Runtime

```sh
npm run start:worker
```

The worker exposes:

```text
GET http://localhost:8081/health/live
GET http://localhost:8081/health/ready
GET http://localhost:8081/metrics
```

Readiness requires PostgreSQL, Redis, consumer-group initialization, and schema
migration 16. `SIGINT` and `SIGTERM` stop consumption before dependency
connections close.

## Verification

```sh
npm run db:migrate:node
npm run db:verify:phase6d
npm run test:worker
npm run test:worker:integration
```
