# Technical Design

Add benchmark contracts to `@opensupport/shared` and deterministic metric/run
logic to `@opensupport/eval`. The runner consumes injected observations and
never calls delivery, approval, commerce, or providers.

## Implementation

- Added versioned `benchmark.v1` variant, observation, result, metric, and run
  contracts.
- Added canonical input hashing, immutable output, concurrent idempotency, and
  fail-closed scope validation.
- Reused the Phase 4 replay behavior evaluator and added deterministic Tool
  Call Accuracy and Human Edit Rate formulas.
- Added boundary tests, static validation, executable spec, and framework
  documentation.

## Verification

- `npm run test:phase5a`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `python3 ./.trellis/scripts/task.py validate 06-20-phase-5a-benchmark-contracts-metrics`
