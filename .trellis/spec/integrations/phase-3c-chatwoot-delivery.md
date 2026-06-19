# Phase 3C Chatwoot Runtime Delivery

## Scope

This contract owns outbound private-note and public-reply delivery in
`packages/chatwoot`. Runtime policy and approval state remain outside this
package.

## Contracts

- `ChatwootDeliveryCommand` is provider-neutral and never contains plaintext
  credentials.
- `ChatwootDeliveryConnection` stores `api_token_ref`; a
  `ChatwootCredentialResolver` resolves the token only at the transport edge.
- `ChatwootDeliveryService.deliver` claims
  `{tenant_id}:{idempotency_key}` before provider I/O.
- Reusing an idempotency key with the same semantic message returns a duplicate
  receipt. Reusing it with changed tenant, trace, conversation, type, or
  content returns `idempotency_conflict`.
- Successful deliveries remain reserved. Failed provider attempts are shared
  across concurrent callers but evicted afterward so the same command can be
  retried.
- Receipts and audits retain tenant, trace, conversation, message type, stable
  decisions, request/response hashes, and credential reference hash only.

## Provider Mapping

Both supported commands call:

```text
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
```

The body always uses `message_type=outgoing` and `content_type=text`.
`private_note` maps to `private=true`; `public_reply` maps to `private=false`.
`content_attributes.agentops_generated=true` prevents outbound messages from
re-entering the inbound pipeline.

## Stable Failures

Validation, tenant mismatch, content hash mismatch, unavailable credential,
authentication, missing conversation, timeout, retryable provider error,
provider error, and idempotency conflict must return project-owned codes.
Thrown provider errors must not cross the package boundary.

## Required Checks

- `npm run typecheck`
- `npm run test:chatwoot`
- `npm run test:phase3c`
- `npm run lint`
- `python3 ./.trellis/scripts/task.py validate 06-19-phase-3c-chatwoot-runtime-delivery`
