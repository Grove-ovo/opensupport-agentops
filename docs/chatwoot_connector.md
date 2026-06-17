# Chatwoot Connector

Status: Phase 1B foundation  
Package: `packages/chatwoot`

## Scope

The connector normalizes Chatwoot Agent Bot and account webhook deliveries into
canonical inbound events. It does not generate AI replies, call tools, run RAG,
or execute runtime modes.

## Endpoint Contracts

Future API adapters should call the framework-neutral handlers exported from
`@opensupport/chatwoot`.

| HTTP endpoint | Handler | Source |
|---------------|---------|--------|
| `POST /v1/chatwoot/agent-bot/:tenant_id` | `handleAgentBotEndpoint` | `agent_bot` |
| `POST /v1/chatwoot/webhooks/:tenant_id` | `handleAccountWebhookEndpoint` | `account_webhook` |

Both handlers accept:

- `tenantId`
- `headers`
- `rawBody`
- optional `parsedBody`
- optional `webhookSecret`
- optional `agentopsActorIds`
- optional `agentopsMessageSignatures`

Both handlers return:

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
audit whether the event seeds the future pipeline or remains audit-only.

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

Only canonical incoming customer messages can seed later pipeline work.

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

## Current Storage Boundary

Phase 1B uses the `DedupeStore` interface and `MemoryDedupeStore` for tests and
local composition. The memory implementation provides process-local atomic
claims but is not shared across replicas. Redis-backed dedupe belongs to a
later runtime/storage task.

## Chatwoot References

- [Add a webhook](https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook)
  documents subscriptions, the signing secret, signature headers, HMAC format,
  and delivery ID header.
- [Create an Agent Bot](https://developers.chatwoot.com/api-reference/account-agentbots/create-an-agent-bot)
  documents the Agent Bot webhook `outgoing_url` and webhook bot type.
