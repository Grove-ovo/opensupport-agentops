# Chatwoot Connector

Status: Phase 6B production API composition
Packages: `packages/chatwoot`, `apps/api`

## Scope

The connector normalizes Chatwoot Agent Bot and account webhook deliveries into
canonical inbound events. `apps/api` composes that boundary with the Agent
pipeline, tenant BYOK provider runtime, controlled runtime modes, approvals,
and persistent outbound delivery.

## Endpoint Contracts

The production API exposes:

| HTTP endpoint | Source |
|---------------|--------|
| `POST /api/v1/chatwoot/agent-bot/:tenantId` | `agent_bot` |
| `POST /api/v1/chatwoot/webhooks/:tenantId` | `account_webhook` |

The API preserves the raw JSON string for HMAC verification before parsing.
The framework-neutral handlers remain available for deterministic package
tests. Both routes return:

- HTTP `202` for accepted customer, duplicate, and audit-only events
- HTTP `400` for invalid JSON payloads
- HTTP `401` for invalid signatures when a webhook secret is configured

## Signature Verification

Account webhook deliveries should include:

- `X-Chatwoot-Timestamp`
- `X-Chatwoot-Signature`
- `X-Chatwoot-Delivery` when a delivery ID is available

When `webhookSecret` is configured, the connector verifies:

```text
sha256=<hmac_sha256("{timestamp}.{raw_request_body}", webhook_secret)>
```

The implementation follows Chatwoot's webhook documentation for signed
deliveries and keeps raw body hashing separate from parsed JSON.

The production API requires `webhook_secret_ref`; it does not use the
framework-neutral connector's unsigned test mode. A missing or unresolved
reference fails closed before canonical event persistence.

## CanonicalInboundEvent

`CanonicalInboundEvent` is defined in `@opensupport/shared`:

```text
tenant_id
source
conversation_id
message_id
event_type
dedupe_key
payload_hash
is_customer_message
is_self_outgoing
```

`source` is either `agent_bot` or `account_webhook`.

`payload_hash` is a SHA-256 hash of the raw request body and is preserved for
audit whether the event seeds the production pipeline or remains audit-only.

## Dedupe Rules

The connector uses two dedupe layers:

- Delivery key: `chatwoot_delivery:{tenant_id}:{x-chatwoot-delivery}`
- Canonical key: `{tenant_id}:{conversation_id}:{message_id}:{event_type}`

When a Chatwoot delivery ID is available, both keys are claimed. This preserves
delivery-level idempotency and still prevents Agent Bot plus account webhook
from seeding the same message twice.

The store must claim the complete key set atomically: it returns `true` only
when every key was absent and has been reserved by the same operation. A Redis
adapter must preserve this contract with a transaction or Lua script; separate
read and write operations are not sufficient.

Only canonical incoming customer messages can seed pipeline work.

## Customer And Self-Outgoing Rules

An event is a pipeline-seeding customer message only when:

- `event_type` is `message_created`
- `message_type` is `incoming` or `0`
- `private` is not `true`
- `is_self_outgoing` is false

AgentOps self-outgoing messages are audit-only. The connector detects them by:

- outgoing `message_type`
- `content_attributes.agentops_generated === true`
- `additional_attributes.agentops_generated === true`
- configured `agentopsActorIds`
- configured `agentopsMessageSignatures`

Human outgoing messages are also not customer messages and therefore do not
seed the future pipeline.

## Production Storage Boundary

The production API first inserts or reads `canonical_inbound_events`, then
claims `processing_status=received -> processing` with one guarded PostgreSQL
update. This database claim is authoritative for exactly-once pipeline seed
behavior across Agent Bot and account webhook requests.

Redis atomically reserves delivery and canonical keys with the configured TTL
to reduce duplicate work across replicas. A Redis miss or expiry cannot create
a second execution because the PostgreSQL processing claim remains final.

Canonical rows store hashes and identifiers only. Raw webhook bodies and
customer text are not persisted.

## Outbound Runtime Delivery

Phase 3C adds `ChatwootDeliveryService` for two explicit side effects:

- `private_note` maps to an outgoing message with `private=true`;
- `public_reply` maps to an outgoing message with `private=false`.

Both call
`POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`
with `content_type=text`. The command contains tenant, trace, conversation,
content hash, idempotency key, and deadline, but no provider URL, account
credential, or plaintext token.

Tenant connection configuration is supplied separately. The production
resolver supports `env:NAME` references and resolves `api_token_ref` only
immediately before provider I/O. Delivery receipts retain
stable result codes, provider message ID, request/response hashes, and a hash
of the credential reference. A claimed idempotency key is never sent twice;
same-message retries return a duplicate receipt and changed-message reuse
returns `idempotency_conflict`.

`chatwoot_delivery_attempts` persists the claim before provider I/O. Successful
deliveries remain deduped. A failed row can be atomically reclaimed by one
later caller with the same semantic input; concurrent retry callers observe
the pending claim and do not send twice.

`content_attributes.agentops_generated=true` plus trace/delivery identifiers
marks messages created by AgentOps so the inbound connector treats them as
audit-only.

Assignment and conversation reopening are used only for explicit handoff.
Message delivery failures produce stable project-owned codes and never count
as a successful public reply.

## Verification

```bash
npm run test:chatwoot
npm run test:e2e
npm run db:verify:phase6b
```

## Chatwoot References

- [Add a webhook](https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook)
  documents subscriptions, the signing secret, signature headers, HMAC format,
  and delivery ID header.
- [Create an Agent Bot](https://developers.chatwoot.com/api-reference/account-agentbots/create-an-agent-bot)
  documents the Agent Bot webhook `outgoing_url` and webhook bot type.
- [Create New Message](https://developers.chatwoot.com/api-reference/messages/create-new-message)
  documents the outbound URL, `api_access_token` header, outgoing message type,
  and private-note flag.
