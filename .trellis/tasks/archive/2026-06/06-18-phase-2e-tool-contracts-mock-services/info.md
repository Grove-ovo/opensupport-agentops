# Technical Design

Phase 2E separates manifest/executor policy from deterministic mock business
data.

- Versioned manifests own JSON schema, risk, timeout, retry, permissions,
  idempotency, and dry-run behavior.
- The executor validates request, schema, permission, idempotency, deadline,
  tenant, and contact ownership in order.
- Mock repository latency and transient failures are deterministic test inputs.
- Refund and handoff operations only produce proposals and never external side
  effects.
- Audit records retain hashes and trace identity, not tool payloads.
