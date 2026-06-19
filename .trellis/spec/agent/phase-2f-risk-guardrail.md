# Phase 2F Risk Guardrail

## Scenario: Rule-First Layered Safety Decisions

### 1. Scope / Trigger

- Trigger: changes to input, retrieval, tool, or output safety decisions and
  their severity/recommendation precedence.
- Applies to `packages/shared/src/risk.ts`, `packages/guardrails`, and
  `docs/risk_guardrail.md`.
- Does not authorize release-gate security eval, approval workflow, or runtime
  transitions.

### 2. Signatures

```ts
evaluateRiskGuardrails(
  input: GuardrailInput,
  modelJudge?: ModelRiskJudge,
  options?: GuardrailOptions,
): Promise<RiskAssessment>
```

### 3. Contracts

- `GateDecision` preserves gate name, decision, reason code, severity, and
  blocking semantics plus tenant/trace/risk-rule version and input hash.
- Rules execute before an optional model judge.
- Model decisions may append but never remove deterministic decisions.
- P0 blocking decisions prevent successful downstream proposals.
- Decisions are sorted by severity, gate, reason, and stable decision ID.
- Decision records hash inspected values and do not persist those values.
- Evidence policy/retrieval versions and tool manifest versions must match the
  immutable trace snapshot, not only the tenant.

### 4. Validation & Error Matrix

| Condition | Decision/error |
|-----------|----------------|
| Prompt injection or approval bypass | P0 block |
| Credential/system prompt request | P0 block |
| Cross-account access | P0 handoff |
| No evidence | P1 clarify, blocking |
| Retrieval conflict/injection/stale version | P0 handoff/block |
| Unsafe tool execution or permission failure | P0 block |
| Unauthorized order result | P0 handoff |
| Tool timeout | P1 clarify |
| Output PII or unsupported policy claim | P0 sanitize/block |
| Cross-scope input/model decision | `GuardrailValidationError` |

### 5. Good/Base/Bad Cases

- Good: retain all P0 findings and choose the strongest recommendation.
- Good: hash proposed output for a PII decision without persisting it.
- Base: no findings returns one immutable `safe` allow decision.
- Bad: let a model `safe` decision overwrite a deterministic injection block.
- Bad: use array insertion order as severity precedence.

### 6. Tests Required

- Tests cover every required threat class and all four gates.
- Tests cover deterministic severity/gate ordering and recommendation choice.
- Tests prove P0 remains blocking when a model judge returns safe.
- Tests prove decisions and assessment arrays are frozen and scope validated.
- Run static validation, lint, type-check, full tests, and Trellis validation.

### 7. Wrong vs Correct

#### Wrong

```ts
return modelDecision ?? ruleDecision;
```

A model can erase an authoritative deterministic block.

#### Correct

```ts
const decisions = [...ruleDecisions, ...validatedModelDecisions];
return aggregateByDeterministicPrecedence(decisions);
```

Model judgment can add context while rule findings remain authoritative.
