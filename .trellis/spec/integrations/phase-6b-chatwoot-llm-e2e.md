# Phase 6B Chatwoot And LLM End-To-End

## Scenario: Production Online Ticket Execution

### 1. Scope / Trigger

- Trigger: changes to Chatwoot API routes, tenant secret resolution, provider
  HTTP adapters, online pipeline composition, persistent delivery idempotency,
  or runtime execution audits.
- Applies to `apps/api`, migration `0015`, Phase 6B verification, and the
  Chatwoot/LLM/local-runtime docs.
- Does not authorize unsigned production webhooks, online creation of runtime
  policy, raw payload persistence, real commerce mutations, or public live
  provider calls in CI.

### 2. Signatures

```text
POST /api/v1/chatwoot/agent-bot/:tenantId
POST /api/v1/chatwoot/webhooks/:tenantId

ProductionTicketService.handle(request): Promise<ChatwootIngressResult>
HttpLLMProviderAdapter.invoke(request): Promise<LLMProviderResponse>
PersistentChatwootDeliveryService.deliver(command, connection)
```

```text
npm run test:api:integration
npm run test:e2e
npm run db:verify:phase6b
npm run smoke:live
```

### 3. Contracts

- Production webhook routes require a resolvable `webhook_secret_ref`; missing
  signature configuration fails before canonical event persistence.
- PostgreSQL canonical processing state is authoritative. Redis TTL claims
  reduce duplicate work but never replace the database execution claim.
- A duplicate canonical event appends new delivery keys without changing the
  original payload hash or starting another pipeline.
- Provider input uses only PII-masked customer text.
- `AGENTOPS_MASTER_KEY` is required at startup and must decode to 32 bytes.
  Parsed key buffers are cleared after each pipeline execution.
- Active model and runtime-mode configurations must already exist. The online
  request path never creates control policy.
- OpenAI-compatible providers use `/v1/chat/completions`; Anthropic uses
  `/v1/messages`. Non-2xx status mapping does not depend on a JSON error body.
- Runtime audits are unique per tenant/canonical event, append-only, and retain
  outcome, latency, estimated cost, hashes, and approval/delivery references.
- Delivery attempts claim tenant plus idempotency key before provider I/O.
  Successful attempts remain final; one same-input caller may reclaim a failed
  attempt.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Missing webhook secret reference | `503 webhook_signature_not_configured` |
| Unresolvable webhook secret | `503 webhook_secret_unavailable` |
| Invalid signature | `401 invalid_signature` |
| Duplicate Agent Bot/webhook message | `202 duplicate`, zero new pipeline calls |
| Missing active model config | canonical event fails closed |
| Missing active runtime config | `runtime_config_unavailable` before provider I/O |
| Ticket/daily budget block | no unsafe provider or Auto action |
| Provider `401`/`403` | `provider_auth_failed` |
| Provider `408`/`429`/`5xx` | `provider_retryable_error` |
| Malformed provider success | `invalid_provider_response` |
| Chatwoot delivery failure | ticket `failed`, persisted delivery attempt and audit link |
| Reused delivery key with changed semantic input | `idempotency_conflict` |

### 5. Good/Base/Bad Cases

- Good: persist and claim the canonical event, mask PII, freeze trace versions,
  run the pipeline, persist logs, then execute one guarded runtime side effect.
- Good: store only `env:NAME` Chatwoot references and decrypt tenant BYOK only
  inside one model invocation.
- Base: Provider failure degrades to handoff without a public reply.
- Bad: accept an unsigned production webhook because the database secret
  reference is null.
- Bad: create runtime policy automatically from request metadata.
- Bad: parse an HTML `503` body before mapping its retryable HTTP status.
- Bad: hard-delete E2E tenants that own append-only LLM logs; use a disposable
  database or archive/deactivate the fixture.

### 6. Tests Required

- Unit tests cover OpenAI-compatible and Anthropic request/response mapping,
  non-JSON provider errors, master-key validation, and stable provider log
  codes.
- Real PostgreSQL/Redis E2E covers dual-entry dedupe, delivery-key merge,
  unsigned configuration rejection, self-outgoing filtering, PII masking,
  Shadow/Assist/Auto, Provider failure, Chatwoot failure, missing runtime
  policy, delivery retry claim, and audit references.
- Apply the complete migration chain twice after adding a foreign key to
  `agent_traces`; early migrations must drop it before rebuilding owned unique
  constraints and the later migration must restore it.
- Run `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run test:api:integration`, Compose validation, and active Trellis task
  validation.

### 7. Wrong vs Correct

#### Wrong

```ts
if (connection.webhook_secret_ref === null) {
  return executeUnsignedWebhook(request);
}
const runtimeConfig = await createDefaultRuntimeConfig(tenantId);
```

This fails open at the integration boundary and lets live traffic invent its
own control policy.

#### Correct

```ts
if (connection.webhook_secret_ref === null) {
  return rejected(503, 'webhook_signature_not_configured');
}
const runtimeConfig = await repository.getActiveRuntimeConfig(tenantId);
if (runtimeConfig === null) {
  throw new Error('runtime_config_unavailable');
}
```

Production ingress requires explicit authentication and previously approved
runtime policy before any provider call.
