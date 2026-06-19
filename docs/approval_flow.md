# Approval Flow

Status: Phase 3E terminal actions

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

## Terminal Actions

Only a pending approval can receive one terminal action:

| Action | Approval state | Ticket state | Public delivery |
|--------|----------------|--------------|-----------------|
| approve | approved | replied | required |
| edit | edited | replied | required, edited text |
| reject | rejected | private_noted | forbidden |
| escalate | escalated | handed_off | forbidden |
| expire | expired | handed_off | forbidden |

Approve and edit first obtain a successful or duplicate Phase 3C Chatwoot
receipt. A retryable delivery failure leaves the approval and ticket pending.
Reject, escalate, and expire cannot even carry delivery parameters.

Every action records actor type/ID, idempotency key, input hash, timestamp, and
delivery identifiers when applicable. Edit actions retain the original
suggested reply, edited reply, and normalized Unicode Levenshtein distance.
Direct state updates and mutation of action audit rows are rejected.
