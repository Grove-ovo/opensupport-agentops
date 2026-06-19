# PRD: Phase 3F - Runtime Modes + Approval Integration

## Goal

Compose Phase 2 proposals with Phase 3 state, decision, delivery, and approval
services into the controlled runtime behavior required by the source PRD.

## Requirements

- Orchestrate Shadow private note, Assist approval, and Auto public reply.
- Preserve expected-state and command idempotency through the complete flow.
- Append runtime mode decision, transition, approval, delivery, cost, and
  failure references to trace/audit boundaries.
- Fail closed on uncertain state, risk, grounding, budget, or delivery outcome.
- Add parent Phase 3 static and runtime acceptance validation.

## Acceptance Criteria

- [x] Source PRD AC-02, AC-03, AC-04, AC-06, and AC-08 pass.
- [x] Duplicate execution produces no duplicate side effect.
- [x] Blocking paths never produce an Auto public reply.
- [x] Required Phase 3 docs and all child tasks are connected.
- [x] Full tests, migrations, database verification, and Trellis Check pass.

## Out of Scope

- Phase 4 Eval and Release Gate.
