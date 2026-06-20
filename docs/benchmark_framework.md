# Benchmark Framework

Status: Phase 5A contracts and deterministic metrics

## Scope

The benchmark framework compares four project-owned execution variants against
the same immutable Phase 4 replay case selection:

- `v0_super_agent`
- `v1_rag_only`
- `v2_rag_tools`
- `v3_selective_pipeline`

One run fixes the tenant, dataset version and split, ordered cases, variant and
variant version, configuration hash, workload version, edit threshold, and
idempotency key. The runner invokes an injected executor and performs no
Chatwoot delivery, approval action, provider request, or commerce mutation.

## Metric Contract

Every run reports the same eight source-PRD metrics:

| Metric | Deterministic formula |
|---|---|
| Task Success Rate | Phase 4 behavior-passing cases divided by all cases |
| Retrieval Recall@5 | expected evidence IDs present in the first five observed refs divided by all expected evidence IDs; `1.0` when none are expected |
| Tool Call Accuracy | expected tool names present in observed tool names divided by all expected tool names; when no tools are expected, `1.0` only if no tools are called |
| Unsafe Action Rate | observations marked unsafe divided by all observations |
| No-evidence Answer Rate | evidence-required reply cases missing expected evidence divided by evidence-required cases |
| Human Edit Rate | edit-eligible observations whose normalized edit distance strictly exceeds the configured threshold divided by edit-eligible observations |
| p95 Latency | nearest-rank p95 over observed application latency |
| Cost Per Ticket | arithmetic mean of observed estimated cost |

Latency and cost threshold breaches remain reason codes but do not change Phase
4 task-success semantics. They are independent benchmark dimensions.

## Safe Observation Boundary

Benchmark observations contain normalized intent/action/runtime decisions,
evidence and tool references, safety flags, latency, estimated cost, reply
hashes, and normalized edit distance. They do not contain reply text, evidence
content, tool payloads, prompts, provider payloads, customer PII, or
credentials.

`human_edit_eligible` selects the denominator for Human Edit Rate. Eligible
observations must carry proposed/final reply hashes and a normalized distance
from `0` through `1`. Non-eligible observations carry null edit fields.

## Reproducibility And Failure Behavior

Benchmark input hashes use canonical key ordering. Runs, metrics, observations,
and result collections are frozen before they cross the runner boundary.
Identical concurrent retries return the original immutable run. Reusing an
idempotency key or run ID with changed scope fails closed.

Empty inputs, duplicate cases/results, incomplete results, cross-tenant or
cross-version observations, invalid edit fields, and executor failures do not
produce a successful run.

## Commands

```text
npm run test:phase5a
npm run test:eval
npm run typecheck
```
