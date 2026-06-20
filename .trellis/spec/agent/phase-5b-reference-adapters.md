# Phase 5B V0 And V1 Reference Adapters

## Scenario: Deterministic Side-effect-free Baselines

### 1. Scope / Trigger

- Trigger: changes to the V0 Super Agent or V1 RAG-only benchmark behavior.
- Applies to `packages/eval/src/reference-adapters.ts` and the adapter section
  of `docs/benchmark_framework.md`.
- Does not implement V2/V3, comparative ranking, load execution, or reports.

### 2. Signatures

```ts
V0SuperAgentBenchmarkAdapter.execute(evalCase, context)
V1RagOnlyBenchmarkAdapter.execute(evalCase, context)
```

### 3. Contracts

- Both adapters consume the same immutable `EvalCase` and
  `BenchmarkExecutionContext`.
- V0 models one monolithic decision with retrieval, expected tool capability,
  risk, and response in one adapter.
- V0 deliberately models the missing layered-gate limitation by allowing
  high-risk public replies to remain Auto and unsafe.
- V1 retrieves expected policy evidence for policy intents and emits no tool
  calls for any case.
- V1 degrades tool-required public replies to clarification while preserving
  non-tool policy replies, clarification, and handoff behavior.
- Latency, cost, hashes, and edit distance are deterministic functions of the
  case and variant, not aggregate score constants.
- Neither adapter imports Chatwoot, approvals, tools, runtime providers, or
  database code.

### 4. Validation Matrix

| Condition | Behavior |
|---|---|
| Context variant does not match adapter | `unsupported_variant` |
| Case tenant/version/split differs from context | `scope_mismatch` |
| Empty or duplicate case references | `invalid_case` |
| Adapter error inside benchmark run | `executor_failed` |

### 5. Tests Required

- Assert repeated execution returns identical observations.
- Cover V0 policy evidence, tool calls, high-risk limitation, hashes, cost,
  latency, and edit distance.
- Cover V1 policy grounding and tool-required degradation.
- Execute V1 over all 150 committed replay cases and assert zero tool calls.
- Cover unsupported variants, cross-scope inputs, invalid cases, and runner
  fail-closed behavior.
- Run package, full, lint, typecheck, static, and Trellis validation.
