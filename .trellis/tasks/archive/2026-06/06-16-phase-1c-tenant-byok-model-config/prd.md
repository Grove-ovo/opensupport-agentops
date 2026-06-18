# Phase 1C: Tenant Config + BYOK Model Config

## Goal

Define tenant-scoped BYOK model configuration for original PRD Phase 1.

## Requirements

- Store tenant-scoped model provider config.
- Support fast model, strong model, embedding model, and fallback model.
- Support timeout, max cost per ticket, and daily budget.
- Store encrypted API key references, not plaintext API keys.
- Treat each model config row as an immutable version so later traces can
  retain a reproducible `model_config_version_id`.
- Allow only one active model config version per tenant.
- Validate provider/model names, timeout, budgets, currency, and API key input
  before producing a persistence record.
- Use local AES-256-GCM envelope encryption for the MVP encrypted API key
  reference.
- Keep production secret manager integration deferred.

## Data Shape

`TenantModelConfig`:

- `id`
- `tenant_id`
- `version`
- `provider`
- `fast_model`
- `strong_model`
- `embedding_model`
- `fallback_model`
- `timeout_ms`
- `max_cost_per_ticket`
- `daily_budget`
- `budget_currency`
- `encrypted_api_key_ref`
- `is_active`
- `config_fingerprint`

## Acceptance Criteria

- Config shape can represent the PRD example tenant model config.
- API key is represented only as an encrypted reference.
- Tenant scoping is explicit.
- Creating a config validates all required values and rejects invalid timeout,
  negative budgets, invalid currency, empty models, and empty API keys.
- AES-256-GCM encryption/decryption round-trips the API key and rejects
  malformed or tampered references.
- The persistence schema supports multiple immutable versions per tenant and
  prevents more than one active version.
- Config fingerprints are deterministic for equivalent non-secret config
  values and do not include plaintext API keys.
- Unit tests, type-check, lint, Phase 1A regression checks, Phase 1C schema
  validation, and Trellis validation pass.

## Technical Approach

- Add a `@opensupport/model-config` TypeScript package containing the
  tenant-model-config contracts, validation, fingerprinting, and local
  envelope encryption utilities.
- Encode encrypted references as an opaque versioned string:
  `enc:v1:<key_id>:<wrap_iv>:<wrapped_key_tag>:<wrapped_key>:<data_iv>:<data_tag>:<ciphertext>`,
  with binary fields encoded using base64url.
- Generate a random data key per API key, encrypt the secret with that data key,
  and wrap the data key with the deployment master key.
- Use a 32-byte master key supplied by the local runtime; never persist the
  master key or plaintext API key.
- Add a forward migration that versions `tenant_model_configs`, replaces the
  single-row-per-tenant constraint with `(tenant_id, version)`, and adds a
  partial unique index for the active version.
- Do not add an HTTP API or PostgreSQL client in this phase. The package emits a
  validated persistence record for a later application/repository adapter.

## Decision (ADR-lite)

**Context**: Controlled launch traces must retain the exact model config used
for an execution. Updating a single tenant row in place would make historical
traces non-reproducible.

**Decision**: Model configurations are immutable versions. New settings create
a new version, and activation is represented separately by `is_active`.

**Consequences**: Storage keeps historical config metadata and encrypted
references. A later repository transaction must deactivate the previous row
and activate the new row atomically.

## Definition of Done

- Model config package and tests are implemented.
- Database migration and static schema validation are implemented.
- `docs/tenant_model_config.md` documents contracts, encryption format,
  versioning, configuration, and deferred production secret storage.
- No plaintext API key appears in config records, fingerprints, logs, or docs.
- Project quality checks pass.

## Out of Scope

- Real model invocation.
- Full secret manager integration.
- Runtime mode downgrade implementation.
- Tenant registration, account APIs, and RBAC.
- Tenant model config HTTP endpoints.
- Production key rotation orchestration.
