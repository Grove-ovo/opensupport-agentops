# Technical Design: Phase 5 - Benchmark + Load Test

Status: Accepted for iterative delivery
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
