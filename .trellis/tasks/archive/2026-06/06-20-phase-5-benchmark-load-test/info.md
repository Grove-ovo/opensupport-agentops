# Technical Design: Phase 5 - Benchmark + Load Test

Status: Completed
Date: 2026-06-20
Base branch: `dev`

## Boundary

Phase 5 compares four architecture variants through one normalized observation
contract and measures in-process application concurrency. It does not create a
benchmark-only HTTP service or call live model/commerce providers.

## Data Flow

```text
immutable replay cases
  -> V0/V1/V2/V3 injected variant executor
  -> normalized observations
  -> benchmark metrics and immutable run
  -> controlled concurrency workload
  -> latency/throughput/event-loop metrics
  -> benchmark/load/cost reports
```

## Core Rules

- Same dataset/version/split/budget for every variant.
- Warmup is excluded from measurements.
- Task success, retrieval, safety, no-evidence, latency, and cost semantics
  reuse Phase 4.
- Tool accuracy and human edit formulas are project-owned and deterministic.
- No delivery, approval action, live provider, or mutable commerce side effect.
- Reports identify fixture/application-level scope explicitly.

## Delivered

- Phase 5A: benchmark contracts, immutable runs, and eight metrics.
- Phase 5B: deterministic V0 Super Agent and V1 RAG-only adapters.
- Phase 5C: deterministic V2 RAG+Tools and actual V3 selective-pipeline
  adapter.
- Phase 5D: shared scope hash, V3 deltas, safety-first ranking, and benchmark
  report.
- Phase 5E: bounded application load harness with warmup, timeout/error
  isolation, percentiles, throughput, and event-loop metrics.
- Phase 5F: reproducible load/cost reports and parent integration validation.

## Final Verification

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run reports:phase5:check`
- `node scripts/validate-phase5.mjs --final`
