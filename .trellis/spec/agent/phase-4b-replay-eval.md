# Phase 4B Replay Eval

## Scenario: Reproducible Candidate Replay

### 1. Scope / Trigger

- Trigger: changes to replay execution, normalized observations, quality,
  grounding, latency, cost, or regression metrics.
- Applies to `packages/eval/src/replay.ts` and replay sections of
  `docs/eval_framework.md`.
- Does not perform runtime delivery, approval actions, security release
  decisions, or candidate promotion.

### 2. Signature

```ts
ReplayEvalRunner.run(
  command: RunReplayEvalCommand,
  now?: Date | string,
): Promise<ReplayEvalResult>
```

### 3. Contracts

- One run uses one tenant, dataset version, split, and candidate hash.
- The candidate executor returns project-owned observations only.
- Observations must preserve case/tenant scope and finite non-negative
  latency/cost.
- Task success is behavior correctness; latency and cost remain separate gate
  metrics and reason codes.
- High-risk recall counts non-Auto, handoff/private-note, or blocking outcomes.
- Retrieval Recall@5 compares expected evidence with the first five refs.
- Idempotent concurrent retries share one immutable run.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Invalid IDs/key/hash/empty cases | `invalid_command` |
| Case/baseline/observation scope mismatch | `scope_mismatch` |
| Reused key with changed input | `idempotency_conflict` |
| Executor throws | `executor_failed` |
| Missing result during metric calculation | `invalid_command` |

### 5. Good/Base/Bad Cases

- Good: compare a test-split candidate to a completed test-split baseline.
- Base: run without a baseline and return a null regression delta.
- Bad: use model-provided aggregate scores as the authoritative metric.
- Bad: import Chatwoot delivery or approval services into replay evaluation.

### 6. Tests Required

- Cover every PRD metric and exact boundary calculation.
- Cover immutable baseline delta, concurrent duplicate, idempotency conflict,
  executor failure, and scope mismatch.
- Static validation forbids delivery/approval imports.
- Run package, full, lint, typecheck, and Trellis checks.

### 7. Wrong vs Correct

#### Wrong

```ts
const metrics = await model.gradeAll(cases);
```

#### Correct

```ts
const observations = await executeCases(cases);
const metrics = calculateReplayMetrics(cases, observations, baseline);
```

Candidate execution is injectable; authoritative metrics remain deterministic.
