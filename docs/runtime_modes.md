# Runtime Modes

Status: Phase 3 runtime orchestration implemented

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

## Runtime Decision Engine

Phase 3B evaluates the requested mode without mutating the trace snapshot:

- Shadow selects a private note when proposal text exists, otherwise handoff.
- Assist selects approval creation when proposal text exists, otherwise
  handoff.
- Auto selects public reply only when the intent is configured, grounding is
  complete, risk is within the configured threshold, and ticket cost and
  latency are within limits.
- Daily budget exhaustion forces Shadow.
- Missing grounding forces Shadow or handoff because no valid approval
  snapshot can be created.
- Other Auto failures use the configured Assist or Shadow downgrade mode.

Each decision records requested/effective modes, action, stable reasons,
runtime config version, blocking status, tenant, trace, and timestamp.
Decision logic is pure. `RuntimeOrchestrator` consumes the decision and owns
the side-effect boundary:

| Decision action | Runtime effect | Terminal/current state |
|-----------------|----------------|------------------------|
| `private_note` | idempotent Chatwoot private note | `private_noted` |
| `create_approval` | immutable pending snapshot, no delivery | `waiting_approval` |
| `public_reply` | idempotent Chatwoot public reply | `replied` |
| `handoff` | no Chatwoot reply | `handed_off` |

The complete execution command is scoped by tenant, trace, and idempotency
key. Concurrent identical commands share one result; changed input with the
same key is rejected. The narrower transition, approval, and delivery
idempotency keys remain authoritative across service boundaries.
Only one execution key may claim a tenant/trace. The orchestrator validates
the expected state before provider I/O and retains uncertain claims for
operator reconciliation instead of automatically risking a second delivery.

Missing Chatwoot configuration, provider failure, stale state, P0 risk,
missing grounding, and daily-budget exhaustion fail closed. Missing grounding
also prevents Assist approval because the immutable approval snapshot must
contain at least one evidence or successful tool-result reference.

Each result links the runtime decision, ticket transition, optional approval,
optional delivery receipt, latency, estimated cost, stable reason codes, and
failure code through `RuntimeExecutionAudit`.
