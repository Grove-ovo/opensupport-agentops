# PRD: Phase 3C - Chatwoot Runtime Delivery

## Goal

Add a tenant-safe outbound Chatwoot boundary for private notes and public
replies without coupling HTTP/provider payloads to runtime policy.

## Requirements

- Define provider-neutral delivery command, receipt, error, and audit types.
- Resolve tenant Chatwoot URL/account/token references outside persisted
  commands.
- Support private-note and public-reply commands only.
- Require trace, conversation, message type, content hash, and idempotency key.
- Treat retries and provider duplicates as one delivery.
- Never log or persist API token plaintext.

## Acceptance Criteria

- [x] Private/public payloads are mapped correctly.
- [x] Duplicate commands do not duplicate messages.
- [x] Timeout, retryable, auth, and validation failures are stable.
- [x] Delivery receipts are tenant/trace scoped and auditable.

## Out of Scope

- Runtime mode policy and approval actions.
