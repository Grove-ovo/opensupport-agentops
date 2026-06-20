# Phase 5 Application Load Report

Generated: 2026-06-20T00:00:00.000Z

> Deterministic in-process reference-fixture measurement. It does not measure HTTP, network, Chatwoot, provider, container, or production capacity.

## Workload Boundary

| Item | Value |
|------|------:|
| Workload | V3 selective pipeline with deterministic injected adapters |
| Dataset split | test |
| Workload items | 50 |
| Workload version | phase5-load-v1 |
| Measured iterations per scenario | 100 |
| Warmup iterations per scenario | 10 |
| Timeout | 1000 ms |
| Concurrency scenarios | 1 / 5 / 10 / 25 |

The harness executes the existing V3 application pipeline. The report fixture injects a deterministic monotonic clock and event-loop probe so report generation is byte-for-byte reproducible. Values validate scheduling, count, percentile, throughput, and reporting semantics; they are not wall-clock capacity claims.

## Scenario Results

| Concurrency | Warmup | Measured | Success | Error | Timeout | Peak Concurrency | Throughput/s | p50 ms | p95 ms | p99 ms | Event-loop Utilization | Event-loop Delay p95 ms | Event-loop Delay Max ms |
|------------:|-------:|---------:|--------:|------:|--------:|-----------------:|-------------:|-------:|-------:|-------:|-----------------------:|------------------------:|------------------------:|
| 1 | 10 | 100 | 100 | 0 | 0 | 1 | 497.512 | 1.000 | 1.000 | 1.000 | 11.00% | 0.220 | 0.370 |
| 5 | 10 | 100 | 100 | 0 | 0 | 5 | 497.512 | 9.000 | 14.000 | 15.000 | 15.00% | 0.300 | 0.450 |
| 10 | 10 | 100 | 100 | 0 | 0 | 10 | 497.512 | 15.000 | 31.000 | 31.000 | 20.00% | 0.400 | 0.550 |
| 25 | 10 | 100 | 100 | 0 | 0 | 25 | 497.512 | 41.000 | 61.000 | 64.000 | 35.00% | 0.700 | 0.850 |

## Invariants

- Warmup results are excluded from measured counts and latency percentiles.
- Success, error, and timeout counts sum to measured iterations.
- Peak observed concurrency never exceeds the configured bound.
- A timeout aborts the invocation but retains its worker slot until the executor settles.
- One measured failure does not cancel unrelated iterations.
