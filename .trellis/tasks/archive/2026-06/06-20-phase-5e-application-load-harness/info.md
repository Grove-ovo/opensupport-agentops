# Technical Design

Use Node `perf_hooks` and a project-owned worker-pool runner. Inject the
workload executor and clock/scheduler where needed for deterministic tests,
while production execution uses monotonic timing and event-loop metrics.

## Implemented

- Added immutable load scenario, iteration, metric, and result contracts.
- Added warmup and measured worker pools with deterministic workload
  selection, bounded concurrency, abortable timeout classification, and
  isolated measured failures.
- Added nearest-rank p50/p95/p99, throughput, event-loop utilization/delay,
  idempotency, hashing, and immutable result behavior.
- Covered concurrency 1, 5, 10, and 25 plus the default Node event-loop probe.

## Verification

- `npm run test:phase5e`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `python3 ./.trellis/scripts/task.py validate 06-20-phase-5e-application-load-harness`
