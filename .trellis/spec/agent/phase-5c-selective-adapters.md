# Phase 5C V2 And V3 Reference Adapters

## Scenario: RAG+Tools Versus Selective Pipeline

### 1. Scope / Trigger

- Trigger: changes to V2 RAG+Tools or V3 Selective Pipeline benchmark
  behavior.
- Applies to `packages/eval/src/selective-adapters.ts` and the V2/V3 section of
  `docs/benchmark_framework.md`.
- Does not perform delivery, approval actions, provider calls, database work,
  or mutable commerce operations.

### 2. Signatures

```ts
V2RagToolsBenchmarkAdapter.execute(evalCase, context)
V3SelectivePipelineBenchmarkAdapter.execute(evalCase, context)
```

### 3. Contracts

- V2 models one deterministic decision flow with policy evidence and expected
  mock tool capabilities.
- V2 has no layered runtime gate and may expose high-risk Auto limitations.
- V3 executes the existing `runAgentPipeline` with deterministic injected
  triage, evidence, tool result, response, and clock adapters.
- V3 uses existing route, grounding, tool planning, risk, and response
  semantics rather than assigning aggregate scores.
- V3 high-risk replies are normalized to Assist, clarifications to Shadow, and
  handoffs remain non-Auto.
- V3 tool results identify `external_side_effect: false`; response proposals
  retain `delivery_performed: false` and `approval_created: false`.
- Both adapters produce the Phase 5A normalized observation contract.

### 4. Validation Matrix

| Condition | Behavior |
|---|---|
| Context variant does not match adapter | `unsupported_variant` |
| Case tenant/version/split differs from context | `scope_mismatch` |
| Selective pipeline step fails | benchmark runner `executor_failed` |
| Retrieval conflict | blocking handoff |
| High-risk grounded reply | Assist, never false Auto |

### 5. Tests Required

- Cover deterministic V2 evidence, mock tools, cost, latency, and high-risk
  limitation.
- Cover V3 actual selective route, evidence, tool planning, risk, response,
  high-risk Assist, and conflict handoff.
- Run V2 and V3 over the same committed test split and compare ordered case
  IDs.
- Assert V3 never reports an unsafe action for the reference fixture.
- Cover unsupported variants and cross-scope input.
- Run package, full, lint, typecheck, static, and Trellis validation.
