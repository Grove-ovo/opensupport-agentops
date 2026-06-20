# Phase 4 Boundary Analysis

## Existing Constraints

- Phase 2 produces proposal-only `AgentPipelineRun` values.
- Phase 3 owns runtime decisions, delivery, approvals, and terminal side
  effects.
- Every trace already freezes agent, prompt, policy, tool, risk, retrieval, and
  model versions.
- The architecture requires immutable release candidate snapshots and a
  `draft -> evaluating -> failed|shadow|assist|auto -> archived` state machine.
- PostgreSQL remains the system of record; no workflow engine is used in MVP.

## Recommended Decomposition

1. Dataset and persistence contracts first so later runners share one schema.
2. Replay and security runners remain independent because their thresholds and
   failure semantics differ.
3. Release candidate transitions are implemented before the gate so promotion
   is not represented by ad hoc status updates.
4. The gate consumes completed immutable runs only.
5. Failure materialization and reports remain asynchronous outputs after the
   authoritative run/gate decisions.

## Dataset Convention

- JSONL with one object per line and deterministic ordering by case ID.
- Explicit dataset version and split (`dev`, `test`, `regression`).
- Inputs contain masked/support-safe text and structured facts only.
- Expected outcomes use project-owned intents, actions, risk, evidence, and
  tool expectations.
- Security cases carry an attack category, P0 flag, forbidden outcomes, and
  required safe action.

## Release Semantics

- `auto`: all required gates pass.
- `assist`: P0 safety passes, but a non-P0 quality/latency/cost/regression gate
  prevents Auto while human approval remains acceptable.
- `shadow`: P0 safety passes but output quality or grounding is insufficient
  for operator-facing suggestions.
- `failed`: missing, invalid, mismatched, or P0-blocking evaluation evidence.

Phase 5 benchmarking is excluded even though the architecture mentions
multiple baseline strategies.
