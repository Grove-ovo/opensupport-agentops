# PRD: Phase 3D - Approval Snapshot Persistence

## Goal

Create exactly one immutable Assist approval snapshot from a grounded proposal
and move the ticket to `waiting_approval`.

## Requirements

- Define approval states and immutable snapshot contracts.
- Persist suggested reply, evidence/tool refs, risk reason, generated action,
  trace/version context, expiry, and input hash.
- Create approval and ticket transition atomically.
- Enforce one active approval per trace and idempotent creation.
- Prevent snapshot mutation after insert.

## Acceptance Criteria

- [ ] Assist creates one pending approval with complete snapshot.
- [ ] Duplicate creation returns the same approval.
- [ ] Snapshot mutation and cross-tenant references are rejected.
- [ ] Ticket enters `waiting_approval` atomically.

## Out of Scope

- Approval terminal actions and public delivery.
