# PRD: Phase 5E - Application Load Harness

## Goal

Measure bounded-concurrency application-level workload behavior with warmup,
latency percentiles, throughput, errors, timeouts, and event-loop metrics.

## Requirements

- Define immutable workload/scenario/result contracts.
- Support configurable warmup, iterations, concurrency, timeout, and workload
  version.
- Execute measured iterations with bounded worker concurrency.
- Record success, error, timeout, throughput, p50/p95/p99, event-loop
  utilization, and event-loop delay.
- Warmup must not affect measured counts or percentiles.
- One failed iteration must not cancel unrelated work.
- Run deterministic scenarios for concurrency 1, 5, 10, and 25.

## Acceptance Criteria

- [ ] Concurrency never exceeds the configured bound.
- [ ] Counts sum to measured iterations.
- [ ] Percentile and throughput boundary formulas are tested.
- [ ] Timeout/error handling is fail-closed and isolated.
- [ ] Trellis Check, lint, type-check, and tests pass.

## Out of Scope

- HTTP, network, container, provider, or distributed load.
