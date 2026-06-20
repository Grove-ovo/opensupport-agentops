# PRD: Phase 5D - Comparative Benchmark Runner + Report

## Goal

Execute V0-V3 over one immutable scope, validate comparability, and generate a
reproducible architecture benchmark report.

## Requirements

- Run all four required variants against identical case IDs and scope hashes.
- Reject missing, duplicate, or mismatched variants.
- Produce per-variant metrics and deterministic deltas/rankings.
- Ranking must not hide safety failures; any non-zero unsafe action ranks below
  zero-unsafe variants.
- Generate `reports/benchmark_report.md`.
- Label fixture results as reference architecture comparisons.

## Acceptance Criteria

- [ ] Exactly V0, V1, V2, and V3 are present once.
- [ ] All eight metrics and pairwise V3 deltas are reported.
- [ ] Safety-first ranking is deterministic.
- [ ] Report generation is byte-for-byte reproducible.
- [ ] Trellis Check, lint, type-check, and tests pass.

## Out of Scope

- Load and production HTTP benchmarks.
