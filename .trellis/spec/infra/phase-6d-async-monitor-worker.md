# Phase 6D Async Monitor Worker

## 1. Scope / Trigger

Use this contract for asynchronous monitor, eval materialization, dashboard
aggregation, PostgreSQL outbox, or Redis Streams changes.

## 2. Signatures

- Outbox types: `monitor_trace | materialize_eval | aggregate_dashboard`
- Stream fields: `outbox_id`, `tenant_id`, `job_type`, `aggregate_type`,
  `aggregate_id`, `dedupe_key`, `attempt`
- Worker endpoints: `GET /health/live`, `GET /health/ready`, `GET /metrics`
- Runtime: `AsyncMonitorWorker.run(signal)` and `runOnce()`

## 3. Contracts

Outbox and stream records contain identifiers only. Publication uses one Redis
Lua command to check the dedupe marker, `XADD`, and store the stream ID.
Consumers use one group and acknowledge only after PostgreSQL handler output
and `async_job_executions.status = succeeded` commit.

Environment keys include `DATABASE_URL`, `REDIS_URL`,
`AGENTOPS_STREAM_KEY`, `AGENTOPS_STREAM_GROUP`,
`AGENTOPS_DEAD_LETTER_STREAM`, `AGENTOPS_WORKER_CONSUMER`,
`AGENTOPS_WORKER_MAX_ATTEMPTS`, and
`AGENTOPS_WORKER_VISIBILITY_TIMEOUT_MS`.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Duplicate published outbox | Return original stream ID |
| Duplicate succeeded job | ACK without re-running handler |
| Fresh processing lease | Leave message pending |
| Stale processing lease | Reclaim and run |
| Handler failure below max attempts | Persist failed state, enqueue retry, ACK |
| Handler failure at max attempts | Persist dead-letter state, append DLQ, ACK |
| Migration below 16 | Readiness `503` |

## 5. Good / Base / Bad Cases

- Good: runtime audit commits two outbox rows and the API response does not wait
  for the worker.
- Base: duplicate delivery produces one monitor result and one execution row.
- Bad: never ACK before the durable handler transaction commits.

> **Warning**: Do not attach new foreign keys to composite unique constraints
> that earlier replayable migrations drop and recreate. Reference stable
> primary keys and enforce tenant scope with a guard trigger.

## 6. Tests Required

- Unit: relay ordering, retry, dead letter, abort, readiness, metrics.
- Integration: real PostgreSQL and Redis outbox relay, monitor result,
  dashboard aggregate, duplicate idempotency, stale pending reclaim, poison
  DLQ.
- Migration: apply twice and run `db:verify:phase6d`.
- Regression: API integration and full `npm test`.

## 7. Wrong vs Correct

### Wrong

```ts
await queue.ack(job.stream_id);
await repository.executeJob(job);
```

### Correct

```ts
await repository.executeJob(job);
await queue.ack(job.stream_id);
```
