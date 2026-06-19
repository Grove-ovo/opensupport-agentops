# Tenant LLM Runtime And Conditional Triage

Status: Phase 2B
Package: `@opensupport/llm-runtime`

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

`runConditionalTriage` skips all provider work when the Code Router sets
`triage_required=false`. Ambiguous cases receive PII-masked text and produce a
validated intent, normalized order IDs, risk level, clarification decision,
confidence, prompt version, model config version, and model name.
