# Harden approval action concurrency

## Goal

Prevent duplicate customer-facing Chatwoot replies when two operators approve
or edit the same pending approval concurrently with different idempotency keys.
The approval action path must claim the pending approval before any external
delivery side effect can run, then persist the terminal action only after a
successful or duplicate delivery receipt.

## What I already know

* Historical review reports identify B-2: `apps/api/src/operations.ts`
  currently performs Chatwoot delivery before the SQL `apply_approval_action`
  compare-and-set.
* Current code still loads the approval, checks `state === 'pending'`, calls
  `PersistentChatwootDeliveryService.deliver(...)`, then calls
  `apply_approval_action(...)`.
* Delivery idempotency only protects retries using the same approval action
  idempotency key. Two independent operators can use different keys and bypass
  delivery-layer dedupe.
* `apply_approval_action(...)` is the only terminal approval mutation path and
  requires approve/edit records to include a successful or duplicate delivery
  receipt.
* Existing specs require delivery failures to leave approvals pending and
  retryable, and require terminal approval actions to be append-only.

## Assumptions

* This task is allowed to evolve the database contract if needed, but should
  avoid a broad approval workflow redesign.
* The first successful approve/edit claim wins. Concurrent conflicting actions
  should fail with the existing `approval_not_pending` conflict before external
  provider I/O.
* Reject and escalate do not perform public delivery and remain in scope only
  for regression safety.

## Requirements

* Approve/edit must acquire an exclusive database-backed approval action claim
  before Chatwoot delivery is attempted.
* If another action has already claimed or terminally changed the approval,
  approve/edit must fail before creating a delivery attempt or making provider
  I/O.
* Delivery success or duplicate receipt must finalize the terminal action via
  `apply_approval_action(...)` and retain existing audit fields.
* Delivery failure must release the claim or otherwise leave the approval
  retryable according to the Phase 3E delivery contract.
* Same-key idempotent retry must preserve existing behavior: same input returns
  the existing action, changed input is rejected as an idempotency conflict.
* Tests must reproduce the old race with different idempotency keys and prove
  that only one provider delivery can occur.

## Acceptance Criteria

* [ ] A focused automated test runs two concurrent approve/edit commands with
      different idempotency keys and asserts exactly one real delivery attempt.
* [ ] The losing concurrent command fails with a stable conflict before
      provider I/O.
* [ ] Delivery failure leaves the approval pending and permits retry.
* [ ] Approval action migration verification continues to pass.
* [ ] `npm run lint`, `npm run typecheck`, and relevant approval/API tests pass.
* [ ] A real PostgreSQL/Redis integration profile is run before finishing, or a
      concrete blocker is recorded.

## Definition of Done

* Production code and database contract prevent duplicate public replies under
  concurrent operator approvals.
* Regression tests cover the concurrency boundary, idempotency, and retry
  behavior.
* Trellis specs are updated if the implementation introduces a new approval
  claim pattern or operational caveat.
* Work is committed, task is archived, and the session journal is recorded.

## Out of Scope

* Live Chatwoot SaaS testing without credentials.
* Replacing the approval domain package API unless required by the production
  API path.
* SSRF DNS allowlist hardening, Docker image changes, or frontend UX changes.

## Technical Notes

* Relevant code:
  * `apps/api/src/operations.ts`
  * `apps/api/src/chatwoot-delivery.ts`
  * `apps/api/src/e2e-repository.ts`
  * `infra/migrations/0009_approval_actions.sql`
  * `infra/verification/phase3e_approval_actions.sql`
* Relevant specs:
  * `.trellis/spec/infra/phase-3e-approval-actions.md`
  * `.trellis/spec/infra/phase-3d-approval-snapshots.md`
  * `.trellis/spec/integrations/phase-3c-chatwoot-delivery.md`
  * `.trellis/spec/infra/phase-6a-api-storage-runtime.md`
* Historical evidence:
  * `reports/FIX_REQUIRED_2026-06-26.md`
  * `reports/CODE_REVIEW_REVISION_2026-06-26.md`
