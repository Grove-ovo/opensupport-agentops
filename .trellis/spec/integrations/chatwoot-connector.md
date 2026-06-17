# Chatwoot Connector

## Scenario: Agent Bot And Account Webhook Canonicalization

### 1. Scope / Trigger

- Trigger: Phase 1B introduces a third-party connector boundary, endpoint
  request/response contracts, signature verification, dedupe behavior, and
  shared canonical event types.
- Applies to `packages/chatwoot`, `packages/shared/src/chatwoot.ts`, and
  `docs/chatwoot_connector.md`.
- Does not authorize AI response generation, Chatwoot message sending, RAG,
  tools, approval, runtime modes, eval, or release gate logic.

### 2. Signatures

Public handlers:

```ts
handleAgentBotEndpoint(
  request: ChatwootEndpointRequest,
  options?: ChatwootEndpointOptions,
): Promise<ChatwootEndpointResponse>

handleAccountWebhookEndpoint(
  request: ChatwootEndpointRequest,
  options?: ChatwootEndpointOptions,
): Promise<ChatwootEndpointResponse>
```

Core utilities:

```ts
verifyChatwootSignature(input: SignatureVerificationInput): SignatureVerificationResult
normalizeChatwootEvent(options: NormalizationOptions): NormalizedChatwootEvent
buildCanonicalDedupeKey(
  tenantId: string,
  conversationId: string,
  messageId: string,
  eventType: string,
): string
```

Endpoint paths reserved for future API adapters:

```text
POST /v1/chatwoot/agent-bot/:tenant_id
POST /v1/chatwoot/webhooks/:tenant_id
```

### 3. Contracts

`ChatwootEndpointRequest`:

| Field | Required | Contract |
|-------|----------|----------|
| `tenantId` | Yes | Tenant owner for dedupe and canonical event |
| `headers` | Yes | Raw HTTP headers, case-insensitive lookup |
| `rawBody` | Yes | Raw request body used for signature and payload hash |
| `parsedBody` | Optional | Pre-parsed JSON body; if absent, connector parses `rawBody` |
| `webhookSecret` | Optional | Enables HMAC signature verification |
| `agentopsActorIds` | Optional | Sender IDs treated as AgentOps-owned outbound actors |
| `agentopsMessageSignatures` | Optional | Message source IDs treated as AgentOps-generated |

`CanonicalInboundEvent`:

```text
tenant_id
source                  # agent_bot | account_webhook
conversation_id
message_id
event_type
dedupe_key
payload_hash
is_customer_message
is_self_outgoing
```

Signature contract:

```text
X-Chatwoot-Signature = sha256=<hmac_sha256("{timestamp}.{raw_request_body}", webhook_secret)>
```

Dedupe contracts:

- Delivery key: `chatwoot_delivery:{tenant_id}:{x-chatwoot-delivery}`.
- Canonical key: `{tenant_id}:{conversation_id}:{message_id}:{event_type}`.
- When delivery ID is present, claim both delivery key and canonical key.
- Same Chatwoot message through Agent Bot and account webhook must seed at most
  one future pipeline execution.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Secret configured and signature invalid | `401`, `rejected`, `invalid_signature` |
| Invalid JSON body | `400`, `rejected`, `invalid_payload` |
| Missing conversation or message ID | `202`, `audit_only`, `missing_message_identity` |
| Incoming customer message first seen | `202`, `pipeline_seeded`, `should_seed_pipeline=true` |
| Same canonical message seen again | `202`, `duplicate`, `should_seed_pipeline=false` |
| Same delivery ID seen again | `202`, `duplicate`, `should_seed_pipeline=false` |
| AgentOps self-outgoing message | `202`, `audit_only`, `self_outgoing_message` |
| Human outgoing or private message | `202`, `audit_only`, `non_customer_message` |

### 5. Good/Base/Bad Cases

- Good: handle Agent Bot and account webhook through the same normalization
  function, passing only the `source` difference.
- Good: keep signature verification based on raw body, not parsed JSON.
- Base: use `MemoryDedupeStore` only for tests and local composition.
- Bad: dedupe Agent Bot and webhook paths only by `X-Chatwoot-Delivery`; Agent
  Bot may not have the same delivery ID.
- Bad: let outgoing AgentOps messages seed the future pipeline.

### 6. Tests Required

- Signature verification:
  - valid HMAC over `{timestamp}.{rawBody}` passes;
  - invalid signature returns `401`.
- Dedupe:
  - Agent Bot then webhook for the same message produces one pipeline seed;
  - repeated webhook delivery ID returns duplicate.
- Filtering:
  - AgentOps self-outgoing message is audit-only;
  - non-customer/private messages do not seed pipeline.
- Audit:
  - response preserves SHA-256 raw payload hash.
- Project checks:
  - `npm run typecheck`;
  - `npm run test`;
  - `npm run lint`.

### 7. Wrong vs Correct

#### Wrong

```ts
const dedupeKey = headers['x-chatwoot-delivery'];
```

This misses Agent Bot plus webhook duplicates when only the webhook has a
delivery ID.

#### Correct

```ts
const deliveryKey = `chatwoot_delivery:${tenantId}:${deliveryId}`;
const canonicalKey = `${tenantId}:${conversationId}:${messageId}:${eventType}`;
```

Claim both keys when delivery ID exists, and always expose the canonical key on
`CanonicalInboundEvent`.
