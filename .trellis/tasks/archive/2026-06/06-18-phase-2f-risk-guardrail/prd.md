# PRD: Phase 2F - Rule-First Risk Guardrail

## Goal

Evaluate input, evidence, tool, and proposed-output safety with deterministic
rules that can block unsafe Phase 2 behavior.

## Requirements

- [x] Implement layered `GateDecision` contracts with reason code, severity, and
  blocking flag.
- [x] Detect prompt injection, approval bypass, credential/system-prompt requests,
  unauthorized order access, evidence conflicts/no-evidence, unsafe tool
  intent, and PII leakage.
- [x] Use rules first; optional model judgment remains an explicit bounded adapter.
- [x] Return sanitize, block, clarify, handoff, or allow recommendations.

## Acceptance Criteria

- Any P0 blocking decision prevents downstream success.
- Gate results are immutable, traceable, tenant-scoped, and versioned by risk
  rules.
- Multiple findings retain deterministic severity precedence.
- Lint, type-check, tests, and Trellis validation pass.

## Dependencies

- Phase 2A
- Phase 2D
- Phase 2E

## Out of Scope

- Security Eval release gate, approval workflow, and runtime-mode transitions.
