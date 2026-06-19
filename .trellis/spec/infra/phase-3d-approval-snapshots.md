# Phase 3D Approval Snapshots

## Contract

- An Assist execution creates exactly one approval row per tenant/trace.
- `create_pending_approval(...)` locks the trace, verifies the complete version
  snapshot, performs `planned|waiting_tool -> waiting_approval`, and inserts
  the approval in one PostgreSQL transaction.
- Same-input retries return the existing approval. Changed input with the same
  idempotency key or trace is rejected.
- Suggested reply, evidence references, tool result references, risk reason,
  generated action, version context, expiry, idempotency key, input hash, and
  creation time are immutable.
- Action fields exist for Phase 3E but are not written by Phase 3D.

## Validation

- UUID tenant, trace, approval, and model config identifiers.
- Non-empty reply and risk reason.
- At least one evidence or tool result reference.
- Complete trace version snapshot matching `agent_traces`.
- Future expiry and SHA-256 input hash.
- Composite foreign keys prevent cross-tenant trace/model references.

## Required Checks

- `npm run test:approvals`
- `npm run test:phase3d`
- `npm run typecheck`
- `npm run lint`
- `npm run db:migrate` twice
- `npm run db:verify:approvals`
