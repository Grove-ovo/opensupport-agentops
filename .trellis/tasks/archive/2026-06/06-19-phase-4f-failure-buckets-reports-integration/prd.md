# PRD: Phase 4F - Failure Buckets + Reports + Integration

## Goal

Convert failed eval/gate outcomes into actionable safe failure records, produce
the required reports, and prove the complete Phase 4 flow.

## Requirements

- Classify quality, grounding, retrieval, tool, risk, security, latency, cost,
  regression, and infrastructure failures with stable precedence.
- Store tenant, run, case, candidate, gate, metric, reason, and hash references
  without source payloads.
- Generate eval, security, and failure-analysis Markdown reports from fixed
  committed fixture runs.
- Add Phase 4 parent static/runtime validation across all child artifacts.

## Acceptance Criteria

- [x] Failed case/gate results map to deterministic failure buckets.
- [x] Failure records contain no input, response, evidence, tool, credential,
  or provider payload.
- [x] All three required reports exist and match fixed fixture metrics.
- [x] All child tasks remain linked and independently executable.
- [x] Full tests, migrations, DB verification, and Trellis Check pass.

## Out of Scope

- Phase 5 benchmark/load/cost comparison and dashboard implementation.
