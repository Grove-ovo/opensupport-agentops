# Phase 1E PII And Trace

## Scenario: Provider-Bound PII Masking And Reproducible Trace Seeds

### 1. Scope / Trigger

- Trigger: changes to customer-text masking, order-ID preservation,
  `PIIMaskResult`, `AgentTrace`, version snapshots, execution-state storage, or
  trace database constraints.
- Applies to `packages/shared/src/pii.ts`,
  `packages/shared/src/trace.ts`, `packages/pii`, `packages/trace`,
  `infra/migrations/0004_pii_mask_trace_schema.sql`,
  `infra/verification/phase1e_trace_schema.sql`, and
  `docs/trace_schema.md`.
- Does not authorize prompt-injection defense, provider calls, replacement-map
  persistence, runtime transition behavior, RAG, tools, approval, or eval.

### 2. Signatures

```ts
maskPII(text: string, options?: MaskPIIOptions): PIIMaskOperation
createAgentTrace(input: CreateAgentTraceInput): AgentTrace
isUuid(value: string): boolean
```

```text
npm run test:phase1e
npm run test:pii
npm run test:trace
npm run db:migrate
npm run db:verify:trace
```

### 3. Contracts

Masking:

- Detect email, supported phone/address forms, Chinese citizen ID, US SSN, and
  Luhn-valid bank cards locally.
- Protect explicitly supplied and labelled order IDs before detector overlap
  resolution.
- Use indexed placeholders and reuse a placeholder for repeated identical
  values.
- `PIIMaskResult` contains only masked text, unique first-occurrence
  categories, and an opaque `pii-map:` reference.
- Original values exist only in `PIIMaskOperation.replacements`; never log or
  persist that array through ordinary trace/LLM contracts.

Trace:

- Require tenant, ticket, conversation, message, runtime mode, complete
  `TraceVersionSnapshot`, and a consistent `PIIMaskResult`.
- Persist only SHA-256 `masked_input_hash`, PII categories, and replacement-map
  reference; do not persist raw or masked customer text.
- `model_config_version_id` is a tenant-consistent UUID foreign key.
- Identity, runtime mode, version snapshot, PII audit fields, hash, and
  creation timestamp are immutable.
- `execution_state` is mutable storage only; transition guards are deferred.

Migration ordering:

- `0003` owns the `(tenant_id, id)` model-config unique constraint used by
  Phase 1D and Phase 1E foreign keys.
- When the full chain is rerun, `0003` must drop
  `agent_traces_tenant_model_config_fk` before rebuilding that unique
  constraint; `0004` restores the trace foreign key.
- `0004` fails when legacy traces lack version or PII audit data. Backfill them
  explicitly; never invent placeholder versions.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Invalid/unsupported replacement map ID | `TypeError` |
| Invalid UUID, enum, timestamp, or required trace ID | `TraceValidationError` |
| PII categories and placeholders differ | `inconsistent_pii_result` |
| Categories exist without `pii-map:` reference | `inconsistent_pii_result` |
| Cross-tenant model config link | PostgreSQL `foreign_key_violation` |
| Duplicate/unsupported PII category | PostgreSQL `check_violation` |
| Invalid JSON trace shape or input hash | PostgreSQL `check_violation` |
| Immutable trace snapshot update | PostgreSQL `check_violation` |
| Operational execution/intent update | Allowed |
| Legacy trace lacks required snapshot during `0004` | PostgreSQL `not_null_violation` |

> **Warning**: Test migration idempotency against the complete ordered chain.
> Testing only `0004` misses dependencies where an earlier migration rebuilds
> a unique constraint referenced by a later foreign key.

### 5. Good/Base/Bad Cases

- Good: mask customer text, send only `masked_text` to the provider boundary,
  and create a trace from the safe result.
- Good: preserve a trusted order ID even when it is numeric and card-length.
- Base: no PII yields unchanged text, no map reference, empty replacements, and
  a trace hash of that provider-bound text.
- Bad: put original PII or the replacement array in trace metadata.
- Bad: infer a missing version using `unversioned` during migration.
- Bad: allow declared categories to differ from placeholders in masked text.

### 6. Tests Required

- PII unit tests must cover all categories, Chinese and US examples, invalid
  checksum candidates, repeated values, explicit/labelled order IDs, an order
  ID nested inside an address, no-PII input, and unsafe map IDs.
- Trace unit tests must cover safe creation, no-PII creation, invalid
  identifiers/enums/snapshots, exact category-placeholder consistency, and
  timestamp validation.
- Static validation must assert shared fields, all TicketExecution states,
  package exports, migration constraints, live verification assertions, docs,
  and root scripts.
- Live PostgreSQL verification must assert operational updates, immutable
  snapshot rejection, tenant FK isolation, PII uniqueness, JSON shapes, and
  hash format.
- Run the full ordered migration twice, then run Phase 1C, 1D, and 1E live
  verification to catch cross-migration dependency drift.

### 7. Wrong vs Correct

#### Wrong

```ts
const trace = {
  customerText,
  replacementMap: operation.replacements,
  promptVersion: currentPromptVersion,
};
```

This leaks PII and points at mutable live configuration.

#### Correct

```ts
const operation = maskPII(customerText, { preserveValues: [orderId] });
const trace = createAgentTrace({
  ...context,
  versionSnapshot,
  piiMaskResult: operation.result,
});
```

Only provider-bound masked text leaves the masking boundary, while the trace
stores immutable version/PII audit metadata and a hash.
