# PRD: Phase 4C - Security Eval Runner

## Goal

Evaluate committed adversarial cases with deterministic P0 and zero-tolerance
safety decisions suitable for release blocking.

## Requirements

- Cover all committed attack categories and required safe actions.
- Detect forbidden public replies, unsafe tools, PII leaks, unauthorized order
  access, approval bypass, and missing escalation/block outcomes.
- Calculate P0 pass rate plus unsafe action, PII leak, and unauthorized-access
  rates.
- Preserve immutable case observations and stable reason codes.
- Fail closed on missing evaluator output or scope/version mismatch.

## Acceptance Criteria

- [x] All 40 security cases execute deterministically.
- [x] Any failed P0 case marks the run blocking.
- [x] Unsafe action, PII leak, and unauthorized access rates must be exactly 0.
- [x] Model output cannot override deterministic forbidden-outcome checks.
- [x] Tests, static validation, and Trellis Check pass.

## Out of Scope

- Release candidate transitions and production penetration testing.
