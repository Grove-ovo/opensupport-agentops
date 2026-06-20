# Benchmark Framework

Status: Phase 5D deterministic comparison and report

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

## V0 And V1 Reference Adapters

`V0SuperAgentBenchmarkAdapter` models one monolithic decision over intent,
retrieval, tools, risk, and response. It can emit the expected evidence and
tool references, but deliberately represents the absence of layered gates:
high-risk public replies remain Auto and are marked unsafe.

`V1RagOnlyBenchmarkAdapter` retrieves policy evidence for return/refund policy
intents and never emits a business tool call. A public reply that requires a
tool is downgraded to clarification. Pure policy replies, existing
clarifications, and handoffs remain available.

These adapters are deterministic reference fixtures. Their latency, cost,
reply hashes, and edit-distance values are derived from case characteristics;
they do not invoke models or claim production quality.

## V2 And V3 Reference Adapters

`V2RagToolsBenchmarkAdapter` adds expected policy evidence plus deterministic
mock order, logistics, refund, and handoff tool capabilities in one flow. It
does not include the layered runtime gate, so high-risk public replies model
an Auto/unsafe limitation.

`V3SelectivePipelineBenchmarkAdapter` executes the existing
`runAgentPipeline` with deterministic injected triage, evidence, mock tool
results, response generation, and clock functions. Existing routing,
grounding, tool planning, and rule-first risk behavior therefore determine the
observation. High-risk replies normalize to Assist, clarification to Shadow,
and policy conflicts remain blocking handoffs.

The injected V3 tool results are reference-only and explicitly record that no
external side effect occurred. The pipeline produces proposals only; Chatwoot
delivery and approval actions are not imported.

## Reproducibility And Failure Behavior

Benchmark input hashes use canonical key ordering. Runs, metrics, observations,
and result collections are frozen before they cross the runner boundary.
Every run also records a `scope_hash` derived from the tenant, dataset
version/split, ordered cases, configuration hash, workload version, and edit
threshold. Variant identity, variant version, run ID, and idempotency key are
excluded, allowing the comparison layer to prove all architectures evaluated
the same immutable workload.
Identical concurrent retries return the original immutable run. Reusing an
idempotency key or run ID with changed scope fails closed.

Empty inputs, duplicate cases/results, incomplete results, cross-tenant or
cross-version observations, invalid edit fields, and executor failures do not
produce a successful run.

## Comparative Report

`compareBenchmarkRuns` accepts exactly one successful run for each V0-V3. It
rejects missing, duplicate, extra, or cross-scope runs and normalizes output
into fixed variant order. Pairwise metric deltas use `V3 - baseline` for V0,
V1, and V2 across all eight metrics.

Ranking is safety-first. Unsafe Action Rate sorts ascending before every other
metric, so no non-zero-unsafe variant can outrank a zero-unsafe variant.
Deterministic tie breakers then use task success, tool accuracy, retrieval
recall, no-evidence rate, human edit rate, latency, cost, and variant ID.

`reports/benchmark_report.md` is generated from the committed test split using
the same public adapters, runner, and comparison function exercised by tests.
It is a deterministic reference-fixture architecture comparison, not a live
provider, network, Chatwoot, or production model-quality benchmark.

## Application Load Harness

`ApplicationLoadHarness` measures an injected workload executor with fixed
warmup, measured iterations, bounded concurrency, timeout, workload version,
and ordered workload references. Selection is deterministic by iteration
index. Warmup uses the same worker pool but is excluded from measured counts,
duration, throughput, and latency percentiles.

Measured results classify each iteration as succeeded, executor error, or
timeout. A timed-out invocation receives an `AbortSignal`; its worker slot is
not released until the executor settles, so actual dispatched workload cannot
exceed the configured concurrency. One failed measured iteration does not
cancel unrelated work. A failed warmup prevents a misleading measurement.

The harness reports count totals, observed peak concurrency, duration,
throughput, nearest-rank p50/p95/p99 latency, event-loop utilization, and p95
and maximum event-loop delay. The default probe uses Node `perf_hooks`.
Injected clocks and probes support deterministic formula tests and committed
report fixtures.

Phase 5 scenarios cover concurrency 1, 5, 10, and 25. These are in-process
application measurements, not HTTP, provider, Chatwoot, container, network,
or distributed capacity results.

## Commands

```text
npm run test:phase5a
npm run test:phase5b
npm run test:phase5c
npm run test:phase5d
npm run test:phase5e
npm run reports:phase5:benchmark
npm run reports:phase5:benchmark:check
npm run test:eval
npm run typecheck
```
