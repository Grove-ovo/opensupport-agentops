# PRD: Phase 3A - Execution State Machine Foundation

## Goal

Make ticket execution transitions explicit, deterministic, idempotent, and
auditable before any Phase 3 delivery side effect is introduced.

## Requirements

- Define shared transition command, decision, reason, actor, and audit types.
- Implement an allow-list transition guard for all `TicketExecution` states.
- Require expected current state, next state, reason code, actor scope, and
  idempotency key.
- Reject terminal-state exits, no-op transitions, invalid scope, and stale
  expected state.
- Add `ticket_execution_transitions` as append-only tenant/trace audit storage.
- Enforce allowed `agent_traces.execution_state` changes in PostgreSQL.
- Preserve immutable trace runtime mode and version snapshot behavior.

## Acceptance Criteria

- [x] Valid transitions return deterministic decisions.
- [x] Invalid, stale, terminal, and cross-scope transitions are rejected.
- [x] Duplicate idempotency keys return the original transition result.
- [x] Direct invalid SQL updates are rejected.
- [x] Valid SQL transition and audit insertion are atomic.
- [x] Migration is idempotent and live verification passes.
- [x] No Chatwoot delivery or approval record is created.

## Out of Scope

- Runtime downgrade policy.
- Chatwoot outbound delivery.
- Approval persistence/actions.
- Eval and release gates.

## References

- Parent: `../06-19-phase-3-runtime-modes-approval/prd.md`
- `docs/architecture.md`
- `.trellis/spec/infra/phase-1e-pii-trace.md`
