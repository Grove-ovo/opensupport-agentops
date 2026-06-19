# Technical Design

Status: Implemented and verified

Materialize `FailureCase` records asynchronously from immutable eval and gate
results. A deterministic report generator renders the required Phase 4
Markdown artifacts and the parent validator checks task/artifact connectivity.

The materializer uses ten stable buckets and emits references, reasons,
numeric metrics, and hashes only. Migration `0013` enforces source shape,
tenant references, and append-only storage. The report generator runs the
committed regression fixture through Replay Eval, Security Eval, Release Gate,
and failure materialization, then supports byte-for-byte reproducibility
checks.
