# Phase 2E Tool Contracts

## Scenario: Tenant-Safe Deterministic Mock Tools

### 1. Scope / Trigger

- Trigger: changes to tool manifests, executor validation, mock business
  services, tool audit records, or idempotency behavior.
- Applies to `packages/shared/src/tools.ts`, `packages/tools`, and
  `docs/tool_contract.md`.
- Does not authorize real commerce APIs, real refunds, Chatwoot delivery, or
  approval workflow.

### 2. Signatures

```ts
executor.execute(
  request: ToolCallRequest,
  options?: ToolExecutorOptions,
): Promise<ToolCallResult>
```

```text
npm run test:phase2e
npm run test:tools
```

### 3. Contracts

- Manifests include version, JSON schema, risk, timeout, retry, permission,
  idempotency, and dry-run fields.
- Requests carry call, trace, tenant, contact, manifest version, idempotency,
  permission, arguments, and absolute deadline fields.
- Order access requires matching tenant and contact ownership.
- Audit records contain hashes, not raw arguments or results.
- Refund requests are always dry-run and duplicate identical requests return
  the original result ID/data.
- A reused idempotency key with different arguments is rejected.

### 4. Validation & Error Matrix

| Condition | Stable code |
|-----------|-------------|
| Invalid IDs, deadline, or empty scope | `invalid_request` |
| Manifest version differs | `manifest_version_mismatch` |
| Arguments fail schema | `invalid_schema` |
| Required permission missing | `permission_denied` |
| Known order belongs to another scope | `unauthorized_order` |
| Unknown order | `not_found` |
| Deadline/manifest timeout exceeded | `timed_out` |
| Mock upstream transient failure | `retryable_error` |
| Duplicate identical request | `duplicate_request` |
| Idempotency key reused for different input | `idempotency_conflict` |

### 5. Good/Base/Bad Cases

- Good: validate manifest/schema/permission/ownership before returning an order.
- Good: return an existing refund preview without another side effect.
- Base: handoff returns a recommendation with delivery disabled.
- Bad: return another tenant's order as `not_found` after already loading its
  business state into logs.
- Bad: include refund reason or order details in the audit record.

### 6. Tests Required

- Tests cover all five tools and stable result IDs.
- Tests cover schema, permission, ownership, not-found, timeout, retryable,
  duplicate, idempotency conflict, and manifest mismatch cases.
- Tests prove refund and handoff have no external side effect.
- Tests prove audits contain hashes but not raw arguments.
- Run static validation, lint, type-check, full tests, and Trellis validation.

### 7. Wrong vs Correct

#### Wrong

```ts
audit.metadata = { arguments: request.arguments, result };
```

This leaks customer and order data into a broadly consumed audit stream.

#### Correct

```ts
audit.input_hash = sha256(canonicalArguments);
audit.output_hash = sha256(canonicalResult);
```

The call remains traceable without duplicating sensitive business payloads.
