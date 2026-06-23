# Phase 7 Tool Permission & Risk Rules Interface (PRD 17.5)

## 1. Scope / Trigger

- Trigger: changes to the tool-manifest or risk-rules operator API routes,
  the `OperationsService` tool/risk methods, the guardrails
  `RISK_RULE_DEFINITIONS` export, or the Tools Dashboard view.
- Applies to `apps/api/src/operations.ts` (tool/risk methods),
  `apps/api/src/operations-routes.ts` (tool/risk routes),
  `apps/api/src/contracts.ts` (tool/risk record types),
  `packages/guardrails/src/rules.ts` (risk rule definitions),
  `packages/tools/src/manifests.ts` (the source manifest), and
  `apps/web/src/views/ToolRiskView.tsx`.
- This view is **read-only** for manifest and risk rules (they are static code
  constants). Only the dry-run panel mutates state (executing a dry-run tool).

## 2. Signatures

```text
GET  /api/v1/tenants/:tenantId/tool-manifest
GET  /api/v1/tenants/:tenantId/risk-rules
POST /api/v1/tenants/:tenantId/tool-dry-run
```

```ts
getToolManifest(tenantId): Promise<readonly ToolManifestRecord[]>
getRiskRules(tenantId): Promise<readonly RiskRuleRecord[]>
runToolDryRun(tenantId, { toolName, arguments, actorId }): Promise<ToolDryRunResult>
```

## 3. Contracts

- **Manifest is static source.** `getToolManifest` returns
  `TOOL_MANIFESTS` from `@opensupport/tools` — the single source of truth.
  Editing the manifest requires a code change; the Dashboard surfaces it
  read-only. The manifest version is `tools-v1`.
- **Risk rules are a static reference.** `RISK_RULE_DEFINITIONS` (in
  `packages/guardrails/src/rules.ts`) mirrors the inline rule maps evaluated
  in `guardrails.ts`. It is a presentation snapshot — editing it does not
  change runtime guardrail behavior. Both sets must stay in sync.
- **Dry-run only.** `runToolDryRun` rejects tools where `manifest.dry_run` is
  `false` with `tool_not_dry_run` (409). Only `check_refund_eligibility`,
  `create_refund_request_dry_run`, and `escalate_to_human` are eligible.
- **Dry-run uses real execution.** The route instantiates a `ToolExecutor`
  with the tenant's `mock_orders` (via `listMockOrders`) and runs the real
  tool path — validating schema, permissions, idempotency, and the business
  outcome — but the dry-run tools never persist side effects.
- **Audit trail.** `runToolDryRun` calls `this.audit(...)` with action
  `tool_dry_run` and a hash of the tool name + arguments.
- **Configuration (PRD 17.5 "configure") is deferred.** Risk level and
  approval requirements are code constants, not DB-backed. True configuration
  would require new version tables and a runtime read path — out of scope for
  this MVP read-only view.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Unknown tool name on dry-run | `tool_not_found` (404) |
| Non-dry-run tool selected | `tool_not_dry_run` (409) |
| Invalid arguments schema | ToolExecutor returns `invalid_schema` |
| Missing permissions | ToolExecutor returns `permission_denied` |
| Order not found | ToolExecutor returns `not_found` |
| Timeout exceeded | ToolExecutor returns `timed_out` |

## 5. Good / Base / Bad Cases

- Good: open the Tools view, review the manifest and risk rules, then run a
  dry-run of `escalate_to_human` with a reason argument and inspect the
  returned data.
- Base: a tenant with no `mock_orders` — dry-run of order-dependent tools
  returns `not_found`, while `escalate_to_human` still succeeds.
- Bad: attempt to dry-run `get_order_status` (a non-dry-run tool) — rejected
  with `tool_not_dry_run`.
- Bad: treat `RISK_RULE_DEFINITIONS` as runtime configuration and expect
  editing it to change guardrail behavior.

## 6. Tests Required

- Route tests (`apps/api/src/operations-routes.test.ts`): manifest list, risk
  rules list, and dry-run (asserts the forwarded command + actor identity +
  returned result) — all against a `FakeOperations`.
- Frontend test (`apps/web/src/App.test.tsx`): `mockFetch` branches for the
  tool-manifest, risk-rules, and tool-dry-run URLs.

## 7. Wrong vs Correct

### Wrong

```sh
# configure risk level via API (not supported — it is static code)
PUT /api/v1/tenants/:tenantId/tool-manifest/get_order_status/risk-level
```

### Correct

```sh
# read the manifest and run a dry-run
GET  /api/v1/tenants/:tenantId/tool-manifest
POST /api/v1/tenants/:tenantId/tool-dry-run
  { "tool_name": "escalate_to_human", "arguments": { "reason": "refund" } }
```
