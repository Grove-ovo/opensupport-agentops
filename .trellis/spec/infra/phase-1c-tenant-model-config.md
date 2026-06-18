# Phase 1C Tenant Model Config

## Scenario: Versioned BYOK Model Configuration

### 1. Scope / Trigger

- Trigger: tenant model configuration crosses shared TypeScript contracts,
  secret encryption, PostgreSQL schema constraints, and future trace version
  snapshots.
- Applies to `packages/shared/src/model-config.ts`,
  `packages/model-config`, `infra/migrations/0002_tenant_model_config_versions.sql`,
  `infra/verification/phase1c_tenant_model_config.sql`, and
  `docs/tenant_model_config.md`.
- Does not authorize model invocation, tenant config HTTP endpoints, runtime
  downgrade behavior, external KMS integration, registration, or RBAC.

### 2. Signatures

```ts
createTenantModelConfig(
  input: CreateTenantModelConfigInput,
  options: CreateTenantModelConfigOptions,
): TenantModelConfig

encryptApiKey(input: EncryptApiKeyInput): string
decryptApiKey(input: DecryptApiKeyInput): string
parseMasterKey(value: string): Buffer
```

Database and validation commands:

```text
npm run db:migrate
npm run db:verify:model-config
npm run test:model-config
npm run test:phase1c
```

### 3. Contracts

`TenantModelConfig` persistence shape:

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

Envelope encryption contract:

- Generate a random 32-byte data encryption key for each API key.
- Encrypt the API key with the data key using AES-256-GCM.
- Wrap the data key with the deployment master key using AES-256-GCM.
- Bind both encryption layers to tenant ID, normalized provider, and key ID
  through additional authenticated data.
- Zero local data-key and master-key buffer copies after use.
- Compute `config_fingerprint` from an ordered JSON tuple of normalized
  non-secret values; delimiter-joined strings are ambiguous when values contain
  the delimiter.
- Persist only this versioned opaque reference:

```text
enc:v1:<key_id>:<wrap_iv>:<wrapped_key_tag>:<wrapped_key>:<data_iv>:<data_tag>:<ciphertext>
```

`AGENTOPS_MASTER_KEY` must decode to exactly 32 bytes and use `base64:`,
`base64url:`, or `hex:` encoding.

Global provider variables such as `OPENAI_API_KEY` are forbidden in the
AgentOps runtime configuration because they bypass tenant-scoped BYOK.

Database version contract:

- `(tenant_id, version)` is unique.
- At most one row per tenant can have `is_active = true`.
- Provider and model fields must already be in canonical trimmed form when
  inserted.
- Config fields, primary key, metadata, and creation timestamp are immutable.
- Activation may update only `is_active`; `updated_at` remains trigger-managed.
- The row `id` is the later trace `model_config_version_id`.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Blank tenant/provider/model/API key | `ModelConfigValidationError` with `required` |
| Tenant ID is not a UUID | validation error |
| Non-integer or out-of-range timeout/version | validation error |
| Negative, non-finite, oversized, or >6 decimal budget | validation error |
| Invalid currency | validation error |
| Master key not exactly 32 bytes | `SecretReferenceError: invalid_master_key` |
| Malformed encrypted reference | `SecretReferenceError: invalid_reference` |
| Wrong tenant/provider/key ID or tampered ciphertext | `SecretReferenceError: decryption_failed` |
| Immutable database field update | PostgreSQL `check_violation` |
| Second active version for a tenant | PostgreSQL `unique_violation` |
| Migration statement fails | entire `0002` transaction rolls back |

### 5. Good/Base/Bad Cases

- Good: create a new immutable version, deactivate the old version, and
  activate the new version in one repository transaction.
- Good: normalize provider/currency before fingerprinting and encryption AAD.
- Base: use the local master key for development while preserving the opaque
  reference boundary needed by a future KMS adapter.
- Bad: encrypt the API key directly with the long-lived master key; that is not
  envelope encryption.
- Bad: update provider, model, budget, encrypted reference, or metadata in
  place; historical traces would no longer be reproducible.
- Bad: include plaintext API keys or encrypted references in config
  fingerprints, logs, frontend responses, or test snapshots.
- Bad: concatenate fingerprint fields with a delimiter that may also occur
  inside a provider or model name.

### 6. Tests Required

- Unit tests must assert:
  - PRD example values produce a valid persistence record;
  - plaintext API key is absent from the record;
  - encryption round-trips with matching tenant/provider;
  - tenant/provider/key-ID or ciphertext tampering fails;
  - equivalent non-secret values produce the same fingerprint;
  - invalid input fields are reported;
  - supported master key encodings parse to 32 bytes.
- Live PostgreSQL verification must assert:
  - immutable fields cannot change;
  - a second active version is rejected;
  - deactivation followed by a new active version succeeds;
  - verification data is rolled back.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, migration, live
  database verification, and Trellis task validation.

### 7. Wrong vs Correct

#### Wrong

```ts
const ciphertext = aesGcmEncrypt(masterKey, apiKey);
```

This uses a long-lived deployment key directly for tenant secret data and does
not provide per-secret data keys.

#### Correct

```ts
const dataKey = randomBytes(32);
const ciphertext = aesGcmEncrypt(dataKey, apiKey, tenantProviderKeyIdAad);
const wrappedDataKey = aesGcmEncrypt(masterKey, dataKey, tenantProviderKeyIdAad);
```

The persisted reference contains the wrapped data key and ciphertext, while
the plaintext API key and data key remain ephemeral.
