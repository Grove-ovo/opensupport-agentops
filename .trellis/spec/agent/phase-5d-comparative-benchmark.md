# Phase 5D Comparative Benchmark

## Scenario: Immutable Safety-first Architecture Comparison

### 1. Scope / Trigger

- Trigger: changes to benchmark comparison, scope validation, pairwise deltas,
  safety-first ranking, or `reports/benchmark_report.md`.
- Applies to `packages/eval/src/comparison.ts`, the Phase 5 report generator,
  and `docs/benchmark_framework.md`.

### 2. Signatures

```ts
compareBenchmarkRuns(
  runs: readonly BenchmarkRun[],
  now?: Date | string,
): BenchmarkComparison
```

### 3. Contracts

- Exactly one successful run for each V0, V1, V2, and V3 is required.
- Every run must share tenant, dataset version/split, config hash, workload
  version, ordered cases, edit threshold, case count, and `scope_hash`.
- `scope_hash` excludes variant/version and idempotency fields so it proves the
  evaluated workload is identical across architectures.
- V3 deltas are always `V3 - baseline` for V0, V1, and V2.
- Ranking first sorts Unsafe Action Rate ascending. No quality, latency, or
  cost metric may rank a non-zero-unsafe variant above a zero-unsafe variant.
- Reports are generated from committed fixtures and carry an explicit
  non-production interpretation boundary.

### 4. Validation & Error Matrix

| Condition | Error |
|---|---|
| Missing required variant | `missing_variant` |
| Duplicate variant | `duplicate_variant` |
| Unsupported or extra run | `invalid_comparison` |
| Different scope hash or scope fields | `scope_mismatch` |
| Invalid comparison timestamp | `invalid_comparison` |
| Generated report differs byte-for-byte | report check failure |

### 5. Good / Base / Bad Cases

- Good: V0-V3 each occur once with one shared scope hash.
- Base: input run order changes; normalized output and ranking remain equal.
- Bad: all visible scope fields match but one scope hash differs; reject the
  comparison because ordered case content is not proven identical.

### 6. Tests Required

- Execute all four real reference adapters over the committed test split.
- Assert exactly four variants, one scope hash, all eight metric deltas, and
  immutable comparison collections.
- Assert every zero-unsafe variant precedes every non-zero-unsafe variant.
- Reject missing, duplicate, mismatched, and invalid-timestamp inputs.
- Generate and check the report byte-for-byte.

### 7. Wrong vs Correct

#### Wrong

```ts
runs.sort((left, right) =>
  right.metrics.task_success_rate - left.metrics.task_success_rate,
);
```

#### Correct

```ts
runs.sort((left, right) =>
  left.metrics.unsafe_action_rate - right.metrics.unsafe_action_rate ||
  right.metrics.task_success_rate - left.metrics.task_success_rate,
);
```

Safety failures remain visible and dominate the architecture ranking.
