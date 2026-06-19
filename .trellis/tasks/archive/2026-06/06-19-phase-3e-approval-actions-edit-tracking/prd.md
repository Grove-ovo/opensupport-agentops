# PRD: Phase 3E - Approval Actions + Human Edit Tracking

## Goal

Apply one terminal operator action to a pending approval, audit the actor, and
guard any approved/edited Chatwoot delivery.

## Requirements

- Implement approve, edit, reject, escalate, and expire transitions.
- Require actor ID/type, expected pending state, and idempotency key.
- Store original and edited replies for edit actions.
- Compute deterministic normalized edit distance.
- Approve/edit may invoke one public delivery; other actions cannot.
- Terminal approvals cannot transition or deliver again.
- Update ticket state consistently with the terminal action and receipt.

## Acceptance Criteria

- [x] Every terminal action is tested.
- [x] Duplicate actions return the original result.
- [x] Conflicting/late actions are rejected.
- [x] Edit distance and both reply versions are retained.
- [x] Reject/escalate/expire cannot produce public delivery.

## Out of Scope

- Approval Queue frontend and full RBAC.
