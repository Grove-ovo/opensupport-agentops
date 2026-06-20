# Phase 5A Benchmark Contracts And Metrics

## Scenario: Reproducible Architecture Benchmark

### 1. Scope / Trigger

- Trigger: changes to V0-V3 benchmark contracts, normalized benchmark
  observations, metric formulas, immutable runs, or idempotency.
- Applies to `packages/shared/src/benchmark.ts`,
  `packages/eval/src/benchmark.ts`, and `docs/benchmark_framework.md`.
- Does not implement variant behavior, load execution, or report ranking.

### 2. Signature

```ts
BenchmarkRunner.run(
  command: RunBenchmarkCommand,
  now?: Date | string,
): Promise<BenchmarkExecutionResult>
```

### 3. Contracts

- Variants are `v0_super_agent`, `v1_rag_only`, `v2_rag_tools`, and
  `v3_selective_pipeline`.
- One run uses one tenant, ordered case set, dataset version/split, variant
  version, config hash, workload version, and edit threshold.
- Task success, retrieval recall, no-evidence rate, latency, and cost preserve
  Phase 4 semantics.
- Tool Call Accuracy is matched expected tools divided by expected tools. With
  no expected tools it is one only when none are called.
- Human Edit Rate uses edit-eligible observations whose normalized edit
  distance strictly exceeds the configured threshold.
- Observations store hashes/references and normalized numbers, never reply
  text, evidence content, tool payloads, prompts, provider payloads, PII, or
  credentials.
- Identical concurrent retries share one immutable run.

### 4. Validation Matrix

| Condition | Behavior |
|---|---|
| Invalid IDs/version/hash/rate or empty cases | `invalid_command` |
| Duplicate cases or results | `invalid_command` |
| Case/result/observation scope mismatch | `scope_mismatch` |
| Reused key or run ID with changed input | `idempotency_conflict` |
| Executor throws | `executor_failed` |
| Incomplete metrics input | fail without partial metrics |

### 5. Tests Required

- Cover all eight metrics and zero-denominator boundaries.
- Cover strict edit-threshold behavior.
- Cover immutable output, concurrent duplicate, changed key/run ID, duplicate
  cases/results, cross-scope observation, incomplete results, and executor
  failure.
- Assert Phase 4 behavior success remains independent from latency/cost reason
  codes.
- Run package, full, lint, typecheck, static, and Trellis validation.

### 6. Wrong vs Correct

#### Wrong

```ts
const metrics = await variant.gradeItself(cases);
```

#### Correct

```ts
const observations = await executeVariant(cases);
const metrics = calculateBenchmarkMetrics(cases, observations, threshold);
```

The variant emits normalized observations; deterministic project code owns the
authoritative comparison.
