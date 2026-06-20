# PRD: Phase 3B - Runtime Mode Decision Engine

## Goal

Resolve requested Shadow, Assist, or Auto mode into one effective action using
deterministic policy and Phase 2 proposal/gate signals.

## Requirements

- Add versioned tenant runtime mode configuration.
- Define `RuntimeModeDecision` with requested/effective mode, action, reason
  codes, blocking flag, and immutable config/version references.
- Shadow always selects private note or handoff.
- Assist always selects approval creation or handoff.
- Auto allows only configured low-risk grounded reply/clarification intents.
- Risk, evidence, tool, timeout, and budget failures downgrade deterministically.
- Decision logic is pure and performs no delivery.

## Acceptance Criteria

- [x] Shadow, Assist, and Auto matrices are exhaustively tested.
- [x] P0 and grounding failures never return Auto public delivery.
- [x] Cost/latency failures record stable downgrade reasons.
- [x] Runtime config is tenant scoped, versioned, and immutable.

## Out of Scope

- Chatwoot delivery and approval persistence.
