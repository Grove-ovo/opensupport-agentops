# PRD: Phase 5A - Benchmark Contracts + Metrics

## Goal

Define immutable, versioned V0-V3 benchmark contracts and deterministic metric
formulas that every later adapter and report must reuse.

## Requirements

- Define `BenchmarkVariant`, benchmark case observation, metrics, run, and
  result contracts.
- Cover Task Success Rate, Retrieval Recall@5, Tool Call Accuracy, Unsafe
  Action Rate, No-evidence Answer Rate, Human Edit Rate, p95 Latency, and Cost
  Per Ticket.
- Define Tool Call Accuracy as expected tool names matched over expected tool
  names, with 1.0 when no tool is expected and none is called.
- Define Human Edit Rate as cases whose normalized proposed/final reply
  distance exceeds the configured threshold divided by reply/approval cases.
- Enforce one tenant/dataset version/split/config/workload version per run.
- Preserve immutable observations, stable input hashes, and idempotency.
- Do not persist reply text, evidence content, tool payloads, or credentials.

## Acceptance Criteria

- [x] All eight metrics have deterministic boundary tests.
- [x] Variant/run/result contracts are immutable and versioned.
- [x] Empty, incomplete, cross-scope, duplicate, and conflicting runs fail.
- [x] Existing Phase 4 metric semantics remain unchanged.
- [x] Trellis Check, lint, type-check, and tests pass.

## Out of Scope

- Concrete V0-V3 behavior and load execution.
