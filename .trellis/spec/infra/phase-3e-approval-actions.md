# Phase 3E Approval Actions

## State Contract

Only `pending` approvals may transition:

- approve -> approved + ticket replied
- edit -> edited + ticket replied
- reject -> rejected + ticket private_noted
- escalate -> escalated + ticket handed_off
- expire -> expired + ticket handed_off

Every transition is terminal. `apply_approval_action(...)` is the only database
mutation path; action rows are append-only and direct approval state updates
are rejected.

## Delivery Contract

- Approve and edit require a successful or duplicate public-delivery receipt.
- Reject, escalate, and expire must not contain delivery fields.
- A retryable delivery failure leaves the approval pending and can be retried
  with the same idempotency key.
- The ticket transition occurs only after a qualifying delivery receipt.

## Audit Contract

Operator actions require actor ID. Expiry requires scheduler actor and no actor
ID. Edited actions retain original snapshot text, edited text, and normalized
Unicode Levenshtein distance rounded to six decimals.

## Required Checks

- `npm run test:approvals`
- `npm run test:chatwoot`
- `npm run test:phase3e`
- `npm run typecheck`
- `npm run lint`
- `npm run db:migrate` twice
- `npm run db:verify:approval-actions`
