# PRD: Phase 4D - Release Candidate State Machine

## Goal

Create reproducible release candidates whose config versions and eval evidence
cannot change during evaluation or promotion.

## Requirements

- Freeze all seven config version IDs and exact replay/security run IDs.
- Implement `draft -> evaluating -> failed|shadow|assist|auto -> archived`.
- Require expected state, stable reason, actor, timestamp, and idempotency.
- Reject direct snapshot/state mutation and append-only transition changes.
- Enforce tenant and eval-run scope in TypeScript and PostgreSQL.

## Acceptance Criteria

- [ ] Valid candidate transitions pass in application and database layers.
- [ ] Stale, invalid, terminal, cross-scope, and conflicting retries fail.
- [ ] Snapshot and transition audit rows are immutable.
- [ ] Migration runs twice and live verification passes.
- [ ] Tests, static validation, and Trellis Check pass.

## Out of Scope

- Calculating gate results or deploying promoted candidates.
