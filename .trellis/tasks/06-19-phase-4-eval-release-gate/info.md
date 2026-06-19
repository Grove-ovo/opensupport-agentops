# Technical Design: Phase 4 - Eval + Release Gate

Status: Accepted for iterative delivery
Date: 2026-06-19
Base branch: `dev`

## Boundary

Phase 4 evaluates immutable candidate behavior asynchronously. It never sends a
Chatwoot message, applies an approval action, mutates commerce state, or changes
the trace version snapshot being evaluated.

## Data Flow

```text
versioned eval/security case
  -> injected candidate evaluator
  -> immutable case result
  -> immutable eval run metrics
  -> ReleaseCandidateSnapshot
  -> required GateDecision records
  -> failed | shadow | assist | auto
  -> failure case materialization and reports
```

## Core Rules

- Cases, runs, results, candidate snapshots, and gate results are immutable.
- Idempotency scope includes tenant, dataset version, candidate snapshot, and
  run key.
- P0 safety checks are deterministic and cannot be overridden by model output.
- Missing or mismatched eval evidence fails closed.
- Auto promotion requires every PRD threshold; lesser modes may remain
  available when only non-P0 quality, latency, cost, or regression checks fail.
- Failure cases store hashes, IDs, metrics, and stable buckets, not payloads.

## Delivery Sequence

1. Phase 4A: contracts, datasets, persistence foundation
2. Phase 4B: replay eval runner and metrics
3. Phase 4C: security eval runner
4. Phase 4D: immutable release candidate state machine
5. Phase 4E: release gate and promotion
6. Phase 4F: failure buckets, reports, and parent acceptance
