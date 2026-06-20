# Technical Design

Create project-owned reference adapters behind `BenchmarkVariantExecutor`.
Adapters map immutable cases to normalized observations and expose architectural
capability differences without using live models.

## Implementation

- Added deterministic V0 monolithic and V1 retrieval-only executors.
- Added tenant/dataset scope to the benchmark execution context.
- Modeled V0 high-risk layered-gate limitations and V1 tool-capability
  degradation without aggregate score constants.
- Kept observations reference/hash-only and excluded all delivery, approval,
  provider, tool runtime, and database dependencies.

## Verification

- `npm run test:phase5b`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `python3 ./.trellis/scripts/task.py validate 06-20-phase-5b-super-agent-rag-only-adapters`
