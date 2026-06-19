# Approval Flow

Status: Phase 3D snapshot persistence

Assist mode creates an approval only from a grounded response proposal. The
snapshot fixes the suggested reply, evidence and tool result references, risk
reason, generated public-reply action, trace version context, expiry, and input
hash before an operator can act.

## Atomic Creation

`create_pending_approval(...)` locks the tenant/trace row, verifies that all
version IDs match the trace, and calls `transition_ticket_execution(...)`
before inserting the approval. PostgreSQL executes both operations in one
transaction, so a ticket cannot remain in `waiting_approval` without its
snapshot and a snapshot cannot exist while the ticket remains `planned`.

The trace permits exactly one approval. Same-input retries return the original
row; a changed snapshot for the same idempotency key or trace is rejected.

## Immutable Boundary

The following fields cannot change after insertion:

- suggested reply;
- evidence and tool result references;
- risk reason and generated action;
- agent, prompt, policy, tool, risk, retrieval, and model versions;
- expiry, idempotency key, input hash, and creation timestamp.

State and action fields are reserved for the guarded Phase 3E approval state
machine. Phase 3D performs no public Chatwoot delivery.
