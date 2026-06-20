# PRD: Phase 5B - Super Agent + RAG-only Adapters

## Goal

Implement deterministic, side-effect-free reference adapters for the V0 Super
Agent and V1 RAG-only benchmark variants.

## Requirements

- V0 models one monolithic agent decision over route, retrieval, tools, risk,
  and response without invoking the selective pipeline.
- V1 uses retrieval evidence for policy intents and never calls business tools.
- Both consume the same benchmark case/context and return normalized
  observations.
- Capability limitations must arise from adapter behavior, not hard-coded
  aggregate scores.
- No Chatwoot, approval, mutable tool, provider, or database side effects.

## Acceptance Criteria

- [x] V0 and V1 produce deterministic observations for every benchmark case.
- [x] V1 never reports a business tool call.
- [x] Policy grounding and tool-required limitations are covered by tests.
- [x] Scope and unsupported variant input fail closed.
- [x] Trellis Check, lint, type-check, and tests pass.

## Out of Scope

- V2/V3 and comparative report generation.
