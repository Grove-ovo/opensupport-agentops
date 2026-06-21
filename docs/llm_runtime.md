# Tenant LLM Runtime And Conditional Triage

Status: Phase 6B production provider composition
Packages: `@opensupport/llm-runtime`, `apps/api`

The runtime accepts only an immutable tenant model config whose ID and tenant
match the pipeline trace snapshot. It decrypts BYOK credentials inside one
invocation scope and passes the plaintext key only to the configured provider
adapter. Keys, prompts, completions, and provider payloads are never included
in LLM call logs.

Before a provider call, the runtime estimates the configured maximum call cost
and evaluates ticket/daily budgets. A blocking budget decision returns a
degraded result without invoking the provider.

The fast model is attempted first. Timeout, provider failure, or invalid
structured output may trigger the configured fallback model once. Every
attempt records model, prompt version, token counts, cost-rate snapshot,
latency, status, and error code through the Phase 1 observability contract.
Successful results expose token and estimated-cost usage to the orchestration
layer so a triage call is included in the response call's budget preflight.

`runConditionalTriage` skips all provider work when the Code Router sets
`triage_required=false`. Ambiguous cases receive PII-masked text and produce a
validated intent, normalized order IDs, risk level, clarification decision,
confidence, prompt version, model config version, and model name.

## Production Provider Adapters

`apps/api` supports:

- OpenAI and compatible providers through `POST /v1/chat/completions`;
- Anthropic through `POST /v1/messages`.

Provider origins are configured with `AGENTOPS_PROVIDER_BASE_URLS_JSON`.
Per-model input/output rates are configured with
`AGENTOPS_MODEL_PRICING_JSON`; missing pricing fails before provider I/O.

The active tenant model config supplies the provider, model names, timeout,
budgets, and encrypted BYOK reference. `AGENTOPS_MASTER_KEY` unwraps that
reference only for the current execution. The parsed master-key buffer is
cleared after the pipeline completes. Plaintext keys, prompts, completions,
and raw provider payloads are not persisted.

Provider HTTP statuses map to stable adapter errors:

- `401`/`403`: `provider_auth_failed`;
- `408`/`429`/`5xx`: `provider_retryable_error`;
- other rejected responses: `provider_rejected`;
- malformed successful responses: `invalid_provider_response`.

The Agent pipeline converts exhausted provider failures into a guarded
clarification or handoff. It does not produce an ungrounded Auto reply.

## Verification

```bash
npm run test:llm-runtime
npm run test:api
npm run test:e2e
```
