# Technical Design

Use compare-and-set approval transitions and the Phase 3C delivery adapter.
Actor audit is required, while identity/RBAC management remains external.

Status: Implemented

The action service and PostgreSQL function enforce one terminal action,
idempotent delivery-aware retries, actor scope, normalized edit distance, and
consistent ticket transitions. Non-delivery actions cannot carry public
delivery fields.
