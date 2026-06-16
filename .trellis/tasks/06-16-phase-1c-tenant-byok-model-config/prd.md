# Phase 1C: Tenant Config + BYOK Model Config

## Goal

Define tenant-scoped BYOK model configuration for original PRD Phase 1.

## Requirements

- Store tenant-scoped model provider config.
- Support fast model, strong model, embedding model, and fallback model.
- Support timeout, max cost per ticket, and daily budget.
- Store encrypted API key references, not plaintext API keys.
- Keep production secret manager integration deferred.

## Data Shape

`TenantModelConfig`:

- `tenant_id`
- `provider`
- `fast_model`
- `strong_model`
- `embedding_model`
- `fallback_model`
- `timeout_ms`
- `max_cost_per_ticket`
- `daily_budget`
- `encrypted_api_key_ref`

## Acceptance Criteria

- Config shape can represent the PRD example tenant model config.
- API key is represented only as an encrypted reference.
- Tenant scoping is explicit.

## Out of Scope

- Real model invocation.
- Full secret manager integration.
- Runtime mode downgrade implementation.
