---
artifact: prd
version: "1.0"
created: 2026-06-20
status: accepted
source: ../../../OpenSupport_AgentOps_PRD.md
---

# PRD: Phase 5 - Benchmark + Load Test

## Goal

Compare the four source-PRD Agent architectures on one immutable dataset and
metric contract, measure application-level concurrency behavior, and produce
reproducible benchmark, load, and cost reports without live providers or
mutable commerce side effects.

## What Is Already Known

- Phase 4 completed 150 replay cases, 40 security cases, normalized candidate
  observations, release metrics, and deterministic report generation.
- The source PRD requires comparison of:
  - V0 Super Agent
  - V1 RAG-only
  - V2 RAG + Tools
  - V3 Selective Multi-Agent Pipeline
- Required comparison metrics are Task Success Rate, Retrieval Recall@5, Tool
  Call Accuracy, Unsafe Action Rate, No-evidence Answer Rate, Human Edit Rate,
  p95 Latency, and Cost Per Ticket.
- Required artifacts are:
  - `reports/benchmark_report.md`
  - `reports/load_test_report.md`
  - `reports/cost_report.md`
- The repository currently has no production AgentOps HTTP service and no live
  provider dependency in tests.

## Requirements

- Define versioned benchmark variant contracts and immutable benchmark run
  results for V0 through V3.
- Run every variant against the same selected dataset version, split, case
  ordering, budgets, and metric definitions.
- Implement deterministic reference adapters for:
  - V0 single Super Agent flow;
  - V1 retrieval-only flow without business tools;
  - V2 retrieval plus mock business tools;
  - V3 existing selective Agent pipeline.
- Reuse Phase 4 evaluation semantics where applicable; do not create conflicting
  definitions for task success, retrieval recall, unsafe action, no-evidence,
  latency, or cost.
- Add Tool Call Accuracy and Human Edit Rate benchmark metrics.
- Ensure all benchmark variants are side-effect free:
  - no Chatwoot delivery;
  - no approval action;
  - no real refund or commerce mutation;
  - no live provider requirement.
- Implement an application-level load runner with:
  - configurable warmup;
  - bounded concurrency;
  - fixed iteration count;
  - success/error/timeout counts;
  - throughput;
  - p50/p95/p99 latency;
  - event-loop utilization and delay;
  - deterministic workload selection.
- Run load scenarios for at least concurrency 1, 5, 10, and 25.
- Separate measured execution cost from configured tenant budget and report
  both.
- Generate all three reports from committed fixture configuration.
- Clearly label reports as deterministic reference-fixture and in-process
  application-level results, not production provider or network benchmarks.
- Preserve an executor boundary for future HTTP/k6/Autocannon adapters.

## Acceptance Criteria

- [x] AC-1: V0, V1, V2, and V3 use the same immutable benchmark input scope.
- [x] AC-2: Every variant reports all eight source-PRD comparison metrics.
- [x] AC-3: Tool Call Accuracy and Human Edit Rate have deterministic,
  documented formulas and boundary tests.
- [x] AC-4: No benchmark variant performs Chatwoot, approval, or mutable
  commerce side effects.
- [x] AC-5: Load scenarios at concurrency 1/5/10/25 report throughput,
  success/error/timeout counts, p50/p95/p99, and event-loop metrics.
- [x] AC-6: Invalid concurrency, incomplete observations, cross-tenant scope,
  duplicate/conflicting run keys, and executor failures fail closed.
- [x] AC-7: Benchmark and load inputs/results are versioned, hashable, and
  reproducible.
- [x] AC-8: `benchmark_report.md` compares V0–V3 without claiming fixture
  results are production quality.
- [x] AC-9: `load_test_report.md` identifies the tested boundary and does not
  claim HTTP/provider capacity.
- [x] AC-10: `cost_report.md` compares average/total cost and tenant budget
  headroom per variant.
- [x] AC-11: All child tasks are archived, linked, and pass full tests,
  report reproduction, type-check, lint, and parent integration validation.

## Proposed Child Tasks

| Task | Scope | Dependency |
|------|-------|------------|
| Phase 5A | Benchmark contracts, formulas, run/result persistence boundary | Phase 4 |
| Phase 5B | V0 Super Agent and V1 RAG-only reference adapters | 5A |
| Phase 5C | V2 RAG + Tools and V3 selective pipeline adapters | 5A |
| Phase 5D | Comparative benchmark runner and benchmark report | 5B-5C |
| Phase 5E | In-process load runner, scenarios, latency/event-loop metrics | 5A, 5C |
| Phase 5F | Cost report, reproducibility, and parent integration validation | 5D-5E |

## Technical Approach

Use a project-owned TypeScript harness in `packages/eval` with injected
`BenchmarkVariantExecutor` and `LoadWorkloadExecutor` boundaries. Use Node
performance APIs for high-resolution timing, histograms, percentiles,
event-loop utilization, and delay. Reuse Phase 4 datasets and normalized
observations.

Variant adapters model architectural capability differences, not arbitrary
score constants. All results retain the variant version, dataset version,
config hash, workload version, and input hash.

No benchmark-only HTTP server is introduced. A future transport adapter can
run the same workload through k6 or Autocannon once an actual API exists.

## Decision (ADR-lite)

**Context**: Phase 5 must compare architecture variants and load behavior, but
the repository currently has package-level runtimes rather than a production
HTTP service or stable live provider environment.

**Decision**: Implement deterministic in-process benchmark and load harnesses
using project-owned contracts and Node performance APIs.

**Consequences**: Results are reproducible and directly comparable in CI, but
they measure fixture behavior and application-level execution only. Production
network/provider capacity remains a future environment-specific benchmark.

## Expansion And Edge Cases

- Keep workload/variant adapters replaceable so real provider and HTTP
  execution can be added without changing metric semantics.
- Warmup must be excluded from measured results.
- One failed execution must be recorded without cancelling unrelated
  iterations.
- Timeout/error results must never be counted as successful task outcomes.
- Variant ordering must not influence fixture selection or result hashes.
- Report generation must be byte-for-byte reproducible.

## Definition of Done

- All six child tasks are committed, checked, archived, and merged to `dev`.
- Benchmark and load formulas are covered by unit and boundary tests.
- Full repository tests, lint, and type-check pass.
- Required reports exist and pass deterministic regeneration checks.
- Parent Phase 5 integration validator passes before and after archive.

## Out of Scope

- Production HTTP capacity or Chatwoot end-to-end load testing.
- Live OpenAI/Anthropic/provider quality or billing benchmarks.
- Real Shopify/WooCommerce/淘宝/京东 load testing.
- Infrastructure autoscaling, distributed workers, or multi-region tests.
- Dashboard UI.
- Changing Phase 4 Release Gate thresholds.

## Research References

- [`research/benchmark-load-harness.md`](research/benchmark-load-harness.md) -
  recommends an in-process Node harness now and preserves future HTTP adapters.

## Technical Notes

- Source PRD: `OpenSupport_AgentOps_PRD.md`
- Existing replay semantics: `packages/eval/src/replay.ts`
- Existing selective pipeline: `packages/agent-runtime/src/runtime.ts`
- Existing reports: `scripts/generate-phase4-reports.mjs`
- Relevant specs:
  - `.trellis/spec/agent/phase-4b-replay-eval.md`
  - `.trellis/spec/agent/phase-4f-failure-buckets-reports.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
