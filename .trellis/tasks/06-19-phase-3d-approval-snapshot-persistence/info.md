# Technical Design

Add approval shared contracts, persistence service, migration, and live
verification. Snapshot columns are immutable; action fields are updated only
through guarded transitions in Phase 3E.

Status: Implemented

The application service and PostgreSQL function both enforce one pending
snapshot per trace, semantic idempotency, complete version context, immutable
evidence/tool/risk/reply fields, and atomic entry to `waiting_approval`.
