# Runtime Modes

Status: Phase 3A state-machine foundation implemented

## Execution State Boundary

Every ticket starts with an immutable requested `runtime_mode` on its trace.
Phase 3 does not mutate that snapshot when a later policy decision downgrades
Auto to Assist or Shadow. Effective mode and downgrade reasons are separate
runtime decision records introduced in Phase 3B.

`execution_state` is mutable only through an explicit transition command:

```text
received
  -> normalized
  -> planned
  -> waiting_tool
  -> waiting_approval
  -> replied | private_noted | handed_off | failed
```

`replied`, `private_noted`, `handed_off`, and `failed` are terminal. The exact
transition graph also permits direct terminal outcomes from `planned` and
selected outcomes after `waiting_tool`.

## Transition Command

Each command carries:

- tenant and trace IDs
- expected and next states
- a stable reason code
- system, operator, or scheduler actor scope
- an idempotency key
- an optional occurrence timestamp

The service rejects stale expected states, no-op or unsupported edges,
incompatible reasons, invalid actors, and cross-tenant scope.

## Atomic Persistence

`transition_ticket_execution(...)` is the PostgreSQL compare-and-set entry
point. It locks the trace, returns an existing matching idempotent transition,
inserts one append-only `ticket_execution_transitions` row, and updates
`agent_traces.execution_state` in the same transaction.

The trace trigger rejects direct state updates that do not reference the
matching audit row. Transition audit rows cannot be updated or deleted.

## Phase 3A Boundary

This foundation performs no Chatwoot delivery and creates no approval. Shadow,
Assist, and Auto decisions are implemented in later Phase 3 tasks.

## Runtime Decision Engine

Phase 3B evaluates the requested mode without mutating the trace snapshot:

- Shadow selects a private note when proposal text exists, otherwise handoff.
- Assist selects approval creation when proposal text exists, otherwise
  handoff.
- Auto selects public reply only when the intent is configured, grounding is
  complete, risk is within the configured threshold, and ticket cost and
  latency are within limits.
- Daily budget exhaustion forces Shadow.
- Other Auto failures use the configured Assist or Shadow downgrade mode.

Each decision records requested/effective modes, action, stable reasons,
runtime config version, blocking status, tenant, trace, and timestamp.
Decision logic is pure; delivery and approval creation remain separate tasks.
