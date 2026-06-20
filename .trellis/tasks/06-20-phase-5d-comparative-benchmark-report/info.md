# Technical Design

Compose four immutable benchmark runs into a comparison result. Generate the
report from committed fixtures through the same public runner and comparison
functions used by tests.

## Implemented

- Added a variant-independent `scope_hash` over tenant, dataset, ordered cases,
  config, workload, and edit threshold.
- Added strict V0-V3 comparison validation, immutable V3 pairwise deltas, and
  safety-first deterministic ranking.
- Added a committed benchmark report generated through the public adapters,
  runner, and comparison API.

## Verification

- `npm run test:phase5d`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `python3 ./.trellis/scripts/task.py validate 06-20-phase-5d-comparative-benchmark-report`
