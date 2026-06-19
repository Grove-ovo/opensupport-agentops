# PRD: Phase 4E - Release Gate + Promotion

## Goal

Evaluate immutable replay/security evidence against every source-PRD threshold
and move a release candidate to the maximum safe runtime state.

## Requirements

- Emit decisions for task success regression, escalation recall, unsafe action,
  no-evidence answers, retrieval recall, p95 latency, cost, and security P0.
- P0/security evidence failures always produce `failed` and block Auto.
- Non-P0 failures deterministically cap promotion at Assist or Shadow.
- All-pass candidates may transition to Auto.
- Gate results are immutable, idempotent, and tied to candidate/run snapshots.
- Missing, incomplete, pending, failed, or mismatched runs fail closed.

## Acceptance Criteria

- [ ] Every required gate decision is present exactly once.
- [ ] All PRD threshold boundary values are tested.
- [ ] P0 failures cannot be overridden or promoted to Auto.
- [ ] Candidate state transition and gate results remain consistent.
- [ ] Database verification, tests, and Trellis Check pass.

## Out of Scope

- Deployment control, traffic shifting, and dashboard UI.
