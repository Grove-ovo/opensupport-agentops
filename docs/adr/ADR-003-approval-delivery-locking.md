---
artifact: adr
version: "1.0"
created: 2026-07-18
status: accepted
---

# ADR-003: Hold Row Lock Across Approval Delivery I/O

## Status

Accepted

**Date:** 2026-07-18
**Deciders:** Grove-ovo, Codex AI PM

## Context

When an operator approves (or edits-and-sends) a suggested reply, the API must
deliver exactly one public reply to Chatwoot and record the terminal approval
state durably. Two failure modes threaten this contract:

1. **Concurrent duplicate approval** — two operators (or a double-click / retried
   request) act on the same `pending` approval at the same time. Without
   coordination both could deliver a public reply.
2. **Partial failure around delivery** — the process can crash or lose its
   database connection between the provider call and the state write, leaving an
   inconsistent record (reply sent but state still `pending`, or state terminal
   but reply never sent).

The delivery path lives in
[`applyDeliveryApprovalAction`](../../apps/api/src/operations.ts). It opens a
transaction, loads the approval `FOR UPDATE`, delivers to Chatwoot, writes the
approval action, then commits.

A prior review (`reports/CODE_REVIEW_2026-06-26.md`) flagged this as a
"deliver-before-persist" race. The implementation already mitigates it with a
held row lock; this ADR records **why** we keep the lock across provider I/O
instead of switching to a compare-and-set (CAS) flip, so future readers do not
"fix" a deliberate design.

## Decision

We hold the `SELECT ... FOR UPDATE` row lock on the approval for the entire
critical section — including the synchronous Chatwoot provider call — and only
`COMMIT` after both the provider call and the action insert succeed.

Concurrency semantics that follow directly:

- A second concurrent approval blocks on the row lock until the first
  transaction commits. It then re-reads the row, observes `state != 'pending'`,
  records a no-op action, and returns without sending a second reply.
- The terminal state and the delivery audit are written in the same transaction,
  so an observer never sees a committed terminal state without a corresponding
  delivery record.

We reject the CAS-first alternative (flip `pending -> processing` in its own
committed transaction, release the lock, then deliver): that design commits a
terminal-ish state *before* the side effect, so a crash between the flip and the
provider call permanently loses the reply while the row already looks handled —
strictly worse for a system with money/PII semantics where a *silently dropped*
reply is harder to detect than a *retryable* one.

## Consequences

### Positive

- No duplicate public reply from concurrent or double-submitted approvals.
- State and delivery audit are atomic: no "sent but not recorded as sent"
  committed state.
- A crash before `COMMIT` leaves the row `pending`, which is safely
  **retryable** rather than silently terminal.

### Negative

- The approval row is locked for the duration of the provider HTTP call, so a
  slow Chatwoot response holds the lock longer. This is bounded by the delivery
  deadline/timeout and only serializes concurrent actions on the *same*
  approval, not across approvals.
- A long-held lock is an anti-pattern if provider latency grows unbounded; the
  delivery deadline is the backstop and must stay conservative.

### Neutral / Accepted Residual Risk

- **Commit-after-deliver window.** If the provider call succeeds but the
  following `COMMIT` fails (e.g. a Postgres network partition), the row stays
  `pending` and a retry re-delivers. This is de-duplicated by the provider-side
  `idempotency_key` carried on the delivery command, so a retry using the **same**
  key collapses to a duplicate/no-op at Chatwoot.
- The unmitigated tail is a retry that supplies a **different** idempotency key
  for the same logical reply. We accept this as low-likelihood (it requires both
  a commit failure and a key change) in exchange for the stronger "never silently
  drop a reply" guarantee. Tracked in
  `docs/operations/known-risk-acceptance.md`.

## Alternatives Considered

### CAS-First State Flip Then Deliver

Flip `pending -> processing` in a short committed transaction, drop the lock,
then deliver outside any lock. Minimizes lock hold time, but commits a
terminal-ish state before the side effect: a crash between flip and provider
call loses the reply with the row already marked handled. Rejected — a
silently dropped reply is worse than a retryable one here.

### Outbox / Two-Phase Delivery

Persist a delivery intent row in the approval transaction, then have an async
worker perform provider I/O with at-least-once semantics and idempotency-key
de-duplication. This fully removes provider latency from the request path and
closes the commit-after-deliver window. It is the recommended next step if we
need synchronous-reply latency guarantees or want to eliminate the residual
window, but it adds a worker, an outbox table, and reconciliation logic beyond
the current MVP need. Deferred, not rejected.

## References

- Implementation: `../../apps/api/src/operations.ts` (`applyDeliveryApprovalAction`)
- Prior review that raised the race: `../../reports/CODE_REVIEW_2026-06-26.md`
- Known-risk ledger: `../operations/known-risk-acceptance.md`
- ADR-002: `ADR-002-controlled-launch-architecture.md`
