# Phase 4F Failure Buckets And Reports

## Scenario: Safe Failure Materialization

### 1. Scope / Trigger

- Trigger: changes to failure classification, failure persistence, Phase 4
  reports, or parent integration validation.
- Applies to `packages/eval/src/failure.ts`, migration `0013`, the Phase 4
  report generator, and integration validators.
- Runs asynchronously and does not block online customer responses.

### 2. Signature

```ts
materializeFailureCases(
  command: MaterializeFailuresCommand,
  now?: Date | string,
): readonly FailureCase[]
```

### 3. Contracts

- Materialize only failed case reasons and failed gate decisions.
- Use stable precedence:
  security, grounding, retrieval, tool, risk, latency, cost, regression,
  quality, infrastructure.
- Output includes references, reasons, numeric metrics, hashes, and timestamps
  only.
- Never persist input/reply/evidence/tool/credential/prompt/provider payloads.
- PostgreSQL records are append-only and tenant/reference scoped.
- Reports are generated from committed regression fixtures with no providers.

### 4. Validation Matrix

| Condition | Behavior |
|-----------|----------|
| Passed result/decision | no failure record |
| Security reason mixed with another category | security wins |
| Cross-tenant result or gate | `scope_mismatch` |
| Invalid IDs/timestamp | `invalid_command` |
| Invalid DB source shape | check violation |
| Failure update/delete | check violation |
| Report drift | `reports:phase4:check` fails |

### 5. Tests Required

- Cover every bucket and classification precedence.
- Verify serialized records contain no forbidden payload field names.
- Run report generation then byte-for-byte report check.
- Run migration twice and live PostgreSQL verification.
- Verify all six Phase 4 child tasks remain linked in dependency order.

### 6. Wrong vs Correct

#### Wrong

```ts
failure.payload = observation;
```

#### Correct

```ts
failure.input_hash = hashSafeReferences(referenceSet);
```

Failure analysis remains actionable through references and stable reasons
without becoming a second store of sensitive runtime data.
