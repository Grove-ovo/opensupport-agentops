# PRD: Phase 4B - Replay Eval Runner + Metrics

## Goal

Execute replay cases against an injected immutable candidate evaluator and
produce reproducible quality, grounding, latency, cost, and regression metrics.

## Requirements

- Run only replay cases from one dataset version and selected split.
- Normalize observations without delivery or mutable side effects.
- Calculate task success, high-risk escalation recall, unsafe action rate,
  no-evidence answer rate, retrieval Recall@5, p95 latency, and average cost.
- Compare task success against an optional completed baseline run.
- Persist immutable case results and run summaries.
- Identical retries return the original run; conflicting keys fail.

## Acceptance Criteria

- [x] All metrics are deterministic and covered by boundary tests.
- [x] Empty, mismatched, incomplete, or cross-tenant runs fail closed.
- [x] Regression delta is calculated from the immutable baseline.
- [x] No replay execution performs Chatwoot or approval side effects.
- [x] Tests, static validation, and Trellis Check pass.

## Out of Scope

- Security categories, release promotion, failure reports, and live providers.
