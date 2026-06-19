# Technical Design

Status: Implemented and verified

`SecurityEvalRunner` reuses the normalized candidate executor but applies
security-specific deterministic assertions after execution. P0 failures and
zero-tolerance violation rates are authoritative.

All 40 committed cases execute within their immutable dataset splits. The
runner freezes observations and reason codes, rejects scope or idempotency
conflicts, and calculates P0, unsafe-action, PII-leak, and unauthorized-access
metrics without trusting model-provided pass/fail values.
