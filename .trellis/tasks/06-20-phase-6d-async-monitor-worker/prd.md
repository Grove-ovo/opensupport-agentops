# Phase 6D: Asynchronous Monitor Worker

## Goal

Move monitoring, failure classification, eval materialization, and dashboard
aggregation onto a separately runnable Redis Streams worker.

## Requirements

- Add an `apps/worker` workspace and independent process entrypoint.
- Publish identifier-only jobs through a PostgreSQL outbox.
- Relay pending outbox records to Redis Streams idempotently.
- Consume Monitor, Eval Materialization, and Dashboard Aggregation jobs through
  consumer groups.
- Acknowledge only after durable writes.
- Retry transient failures with bounded attempts and move exhausted jobs to a
  dead-letter stream with safe metadata.
- Reclaim stale pending messages after a configurable visibility timeout.
- Expose worker liveness/readiness and Prometheus-compatible metrics.
- Keep all worker handlers deterministic for the same immutable references.

## Acceptance Criteria

- [ ] Online API completion does not wait for monitor/eval/aggregation work.
- [ ] Duplicate jobs are idempotent.
- [ ] Worker restart resumes pending work without loss.
- [ ] Poison jobs reach the dead-letter stream after bounded retries.
- [ ] Failure cases and dashboard aggregates are persisted correctly.
- [ ] Real Redis/PostgreSQL integration tests and graceful shutdown tests pass.

## Out Of Scope

- External workflow engines.
- Provider-specific managed queue services.

