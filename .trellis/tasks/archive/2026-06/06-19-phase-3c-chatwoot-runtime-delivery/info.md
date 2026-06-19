# Technical Design

Extend `packages/chatwoot` with an outbound adapter interface and deterministic
fake transport tests. Runtime code consumes project-owned commands/receipts.

Status: Implemented

Commands remain provider-neutral and credential-free. The delivery service
atomically claims tenant idempotency keys, resolves credential references at
the transport edge, maps private/public payloads, and returns trace-scoped
auditable receipts with stable failure codes.
