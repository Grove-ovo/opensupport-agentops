# PRD: Phase 5F - Cost Report + Integration

## Goal

Generate deterministic load and cost reports, enforce report reproducibility,
and prove the full Phase 5 task/artifact chain.

## Requirements

- Generate `reports/load_test_report.md` from scenarios 1/5/10/25.
- Generate `reports/cost_report.md` with average cost, total cost, budget,
  headroom, and relative V3 deltas.
- Clearly state in-process/reference-fixture limitations.
- Add Phase 5 parent integration validation and report drift checks.
- Confirm all six child tasks remain linked and independently executable.

## Acceptance Criteria

- [x] All three Phase 5 reports exist and reproduce byte-for-byte.
- [x] Cost report separates measured cost from tenant budget.
- [x] Load report includes required counts, throughput, percentiles, and
  event-loop metrics for all four scenarios.
- [x] Parent integration validator resolves active or archived tasks.
- [x] Full tests, Trellis Check, lint, and type-check pass.

## Out of Scope

- Dashboard UI and production performance claims.
