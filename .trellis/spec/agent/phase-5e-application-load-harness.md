# Phase 5E Application Load Harness

## Scenario: Bounded In-process Workload Measurement

### 1. Scope / Trigger

- Trigger: changes to load scenario contracts, worker concurrency, warmup,
  timeout classification, percentiles, throughput, or event-loop metrics.
- Applies to `packages/shared/src/load.ts` and
  `packages/eval/src/load.ts`.
- Measures application execution only; it excludes HTTP, network, providers,
  containers, and distributed workers.

### 2. Signatures

```ts
ApplicationLoadHarness.run(
  command: RunLoadScenarioCommand,
): Promise<LoadExecutionResult>

calculateLoadMetrics(
  results,
  durationMs,
  maxObservedConcurrency,
  eventLoop,
): LoadScenarioMetrics
```

### 3. Contracts

- Scenario fields fix tenant, workload version and item references, warmup
  count, measured iterations, concurrency, and timeout.
- Workload selection is `iteration_index % workload_item_refs.length`.
- Warmup uses the same worker pool but is excluded from measured results,
  duration, throughput, and latency percentiles.
- A timeout aborts the invocation but does not release its worker slot until
  the executor settles, preserving the configured concurrency ceiling.
- Measured executor errors and timeouts are isolated and never cancel other
  iterations.
- Iteration records contain references, status, stable error code, and
  latency only; executor messages and payloads are not persisted.
- Default runtime measurement uses Node monotonic time,
  `eventLoopUtilization`, and `monitorEventLoopDelay`.
- Each run obtains its own event-loop probe instance so independent concurrent
  scenarios do not reset or stop each other's measurements.
- For sub-resolution runs, normalize maximum event-loop delay to at least p95;
  Node histograms can report a minimum percentile before recording a non-zero
  maximum sample.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Invalid IDs, bounds, refs, or key | `invalid_command` |
| Reused key/run ID with changed input | `idempotency_conflict` |
| Warmup error or timeout | `warmup_failed` |
| Measured executor rejection | record `executor_error` |
| Measured deadline reached | abort and record `timeout` |
| Missing/duplicate/invalid metric result | `invalid_command` |

### 5. Good / Base / Bad Cases

- Good: concurrency 25 runs 30 measured iterations with observed peak 25.
- Base: one iteration rejects; other workers continue and counts still sum.
- Bad: timed-out work releases a slot before settling, allowing actual
  executor concurrency to exceed the configured bound.

### 6. Tests Required

- Assert warmup invocations are absent from measured counts and percentiles.
- Assert observed and executor concurrency never exceed 1, 5, 10, or 25.
- Cover success, executor error, timeout, and count-sum invariants.
- Cover nearest-rank p50/p95/p99 and throughput formulas.
- Cover the default Node probe on a sub-resolution synchronous scenario.
- Cover duplicate, conflicting, invalid, warmup-failure, and immutable output.
- Run package, full, lint, typecheck, static, and Trellis validation.

### 7. Wrong vs Correct

#### Wrong

```ts
await Promise.race([operation, timeout]);
startNextIteration();
```

#### Correct

```ts
const outcome = await Promise.race([operation, timeout]);
if (outcome === 'timeout') await operation;
releaseWorkerSlot();
```

The timeout is recorded at its deadline, while the worker slot remains
occupied until the aborted executor has actually settled.
