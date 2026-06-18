# Tenant Model Config

Status: Phase 1C foundation  
Package: `packages/model-config`  
Migration: `infra/migrations/0002_tenant_model_config_versions.sql`

## Scope

Phase 1C validates and encrypts tenant-scoped BYOK model configuration before a
future repository persists it. It does not invoke model providers, expose an
HTTP API, or implement runtime budget downgrade behavior.

## Data Flow

```text
tenant-scoped input
  -> validation and normalization
  -> AES-256-GCM API key encryption
  -> non-secret config fingerprint
  -> TenantModelConfig persistence record
  -> tenant_model_configs
```

The returned persistence record contains `encrypted_api_key_ref`; it never
contains the plaintext API key.

## TenantModelConfig

`TenantModelConfig` is defined in `@opensupport/shared`:

```text
id
tenant_id
version
provider
fast_model
strong_model
embedding_model
fallback_model
timeout_ms
max_cost_per_ticket
daily_budget
budget_currency
encrypted_api_key_ref
is_active
config_fingerprint
```

The default demo values from the product PRD are:

```json
{
  "provider": "openai",
  "fast_model": "gpt-4.1-mini",
  "strong_model": "gpt-4.1",
  "embedding_model": "text-embedding-3-small",
  "fallback_model": "gpt-4.1-mini",
  "timeout_ms": 10000,
  "max_cost_per_ticket": 0.02,
  "daily_budget": 5.0,
  "budget_currency": "USD"
}
```

The source PRD's `tenant_demo` value is a human-readable tenant identifier. The
persistence contract resolves it to the UUID primary key from `tenants`.

## Validation

- Tenant ID must be a UUID. Provider and all model role names must be
  non-empty.
- Version must be a positive integer.
- Timeout must be an integer from `1` through `120000` milliseconds.
- Ticket and daily budgets must be finite values from `0` through
  `999999.999999` with at most six decimal places.
- Currency must be a three-letter ISO-style uppercase code.
- API key input must be non-empty.

Provider names are normalized to lowercase, currency to uppercase, and
surrounding whitespace is removed from non-secret string fields. API keys are
not trimmed or otherwise transformed.

## Local Envelope Encryption

The MVP generates a random 32-byte data encryption key for each API key. The
data key encrypts the API key with AES-256-GCM and is then wrapped by the
deployment master key with a second AES-256-GCM operation. Both layers use
random 12-byte IVs and tenant/provider/key-ID additional authenticated data.
Moving a reference to another tenant or provider, or changing its key ID,
causes decryption to fail.

The opaque reference format is:

```text
enc:v1:<key_id>:<wrap_iv>:<wrapped_key_tag>:<wrapped_key>:<data_iv>:<data_tag>:<ciphertext>
```

`AGENTOPS_MASTER_KEY` must be exactly 32 bytes and use one of these versioned
encodings:

```text
base64:<standard-base64-encoded-32-byte-key>
base64url:<base64url-encoded-32-byte-key>
hex:<64-hex-character-key>
```

Generate a local Base64URL key with:

```bash
node -e "console.log('base64url:' + require('node:crypto').randomBytes(32).toString('base64url'))"
```

The deployment master key and plaintext tenant API keys must not be committed,
logged, returned to frontend code, included in fingerprints, or stored in
PostgreSQL.

Provider API keys are supplied only through the tenant config creation flow.
The runtime does not use global provider variables such as `OPENAI_API_KEY`,
because they bypass tenant ownership and audit boundaries.

## Immutable Versions

Each row is an immutable model config version. New settings create a new
`(tenant_id, version)` row instead of updating provider, model, budget, timeout,
secret reference, or metadata fields in place.

The database allows `is_active` to change and enforces at most one active
version per tenant. A future repository must activate a version in one
transaction:

1. Deactivate the current tenant version.
2. Insert or activate the new version.
3. Commit both changes together.

The row `id` is the value later recorded as `model_config_version_id` in trace
snapshots. `config_fingerprint` is a SHA-256 digest of normalized non-secret
configuration values serialized as an ordered JSON tuple. It excludes the API
key and encrypted reference.

## Deferred Production Work

- External secret manager or KMS integration.
- Automated key rotation and re-encryption.
- Tenant model config HTTP endpoints and authorization.
- Provider credential verification calls.
- Cost-cap and timeout runtime downgrade execution.

## Verification

Apply migrations and run the live constraint check:

```bash
npm run db:migrate
npm run db:verify:model-config
```

The verification runs in a rolled-back transaction and proves that immutable
fields cannot change, a tenant cannot have two active versions, and a new
version can be activated after the old one is deactivated.
