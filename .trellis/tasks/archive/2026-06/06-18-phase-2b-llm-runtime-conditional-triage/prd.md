# PRD: Phase 2B - Tenant LLM Runtime + Conditional Triage

## Goal

Add a tenant-scoped provider invocation boundary and use it only when Phase 2A
marks routing as ambiguous.

## Requirements

- Resolve immutable tenant model config and decrypt BYOK only for one call.
- Enforce deadline, timeout, fallback model, cost budget, PII-safe prompt, and
  Phase 1 LLM call logging.
- Define provider-neutral request/response and error contracts.
- Produce a validated `TriageDecision` with intent, entities, risk level,
  clarification need, confidence, and prompt/model version references.
- Mock provider behavior in tests; no live provider key is required.

## Acceptance Criteria

- [x] Clear Code Router decisions skip triage.
- [x] Ambiguous decisions call the tenant fast model at most once plus configured
  fallback when allowed.
- [x] Plaintext keys and prompt/completion content are not logged or persisted.
- [x] Timeout, provider error, invalid model output, budget exceedance, and fallback
  exhaustion return explicit degraded results.
- [x] Lint, type-check, tests, and Trellis validation pass.

## Dependencies

- Phase 2A
- Phase 1 model config, PII, trace, and LLM observability contracts

## Out of Scope

- Response generation, RAG, tools, approvals, and real provider integration
  tests.
