# Tool Contract And Mock Services

Status: Phase 2E implemented

## Boundary

The tool layer is MCP-compatible at the contract level: every tool has a
versioned name, description, JSON input schema, risk, timeout, retry,
permission, idempotency, and dry-run policy. Phase 2 does not expose a network
MCP server and does not call real ecommerce systems.

## Tools

- `get_order_status`
- `get_logistics_status`
- `check_refund_eligibility`
- `create_refund_request_dry_run`
- `escalate_to_human`

Order tools validate both tenant and contact ownership before returning state.
Unknown orders return `not_found`; known orders outside the request scope return
`unauthorized_order`.

## Execution

The executor validates request identity, manifest version, schema, permission,
idempotency, and deadline before calling the mock service. Stable result codes
include:

```text
ok
duplicate_request
invalid_schema
invalid_request
manifest_version_mismatch
permission_denied
unauthorized_order
not_found
timed_out
retryable_error
idempotency_conflict
```

Audit records contain call/trace/tenant/tool identity plus SHA-256 input and
output hashes. They never contain raw tool arguments or business results.

## Refund Safety

`create_refund_request_dry_run` never performs an external side effect. A
successful result reports `external_side_effect=false` and either
`ready_for_approval` or `not_eligible`. Reusing the same tenant/tool/idempotency
key with identical arguments returns the original result ID and data with
`duplicate_request`. Reusing it with different arguments is rejected.
