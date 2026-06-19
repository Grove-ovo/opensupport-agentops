# PRD: Phase 2E - Tool Contracts + Mock Business Services

## Goal

Implement deterministic MCP-compatible tool contracts and tenant-safe mock
order, logistics, refund, and handoff services.

## Requirements

- [x] Define tool manifest/version, JSON schema, risk, timeout, retry, permission,
  idempotency, audit, and error contracts.
- [x] Implement `get_order_status`, `get_logistics_status`,
  `check_refund_eligibility`, `create_refund_request_dry_run`, and
  `escalate_to_human`.
- [x] Validate tenant/contact ownership before returning business state.
- [x] Return existing dry-run status for duplicate refund requests.
- [x] Add `docs/tool_contract.md`.

## Acceptance Criteria

- Invalid schema, unauthorized order access, timeout, not-found, retryable, and
  duplicate cases return stable error/result codes.
- Refund execution remains dry-run only.
- Tool call/result IDs are traceable and audit-safe.
- Lint, type-check, tests, and Trellis validation pass.

## Dependencies

- Phase 2A

## Out of Scope

- Real ecommerce APIs, real refund execution, approval workflow, and LLM-direct
  external calls.
