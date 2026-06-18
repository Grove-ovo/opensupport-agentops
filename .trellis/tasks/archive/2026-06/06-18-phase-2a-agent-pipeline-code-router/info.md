# Technical Design: Phase 2A

Status: Implemented and verified
Date: 2026-06-18

## Modules

- `packages/shared/src/agent.ts`: shared pipeline contracts.
- `packages/agent-core`: validation and deterministic Code Router.
- `docs/agent_pipeline.md`: routing contract and precedence.

## Routing Precedence

1. explicit complaint/escalation
2. explicit refund request
3. refund eligibility
4. logistics
5. order status
6. invoice
7. return policy
8. unknown/ambiguous

Sensitive-signal detection runs independently and never disappears because a
business intent matched.

## Safety Boundary

The router receives PII-masked text. It may return normalized entities and
reason codes, but not the full input text. It performs no side effect and no
network or database access.

## Verification

- Phase 2A static validation passed.
- Agent Core unit tests passed: 8/8.
- Full repository tests, type-check, lint, and Trellis validation passed.
