# PRD: Phase 5C - RAG+Tools + Selective Pipeline Adapters

## Goal

Implement deterministic V2 RAG + Tools and V3 Selective Multi-Agent Pipeline
benchmark adapters.

## Requirements

- V2 adds retrieval and mock order/logistics/refund tools but uses a single
  decision flow without conditional multi-agent routing.
- V3 reuses the existing route/RAG/tool/risk/response capability semantics.
- Both remain provider-free and side-effect-free.
- V3 high-risk cases must retain Assist/Shadow/handoff behavior rather than
  falsely reporting Auto success.
- Adapter output must match the Phase 5A normalized observation contract.

## Acceptance Criteria

- [x] V2 and V3 execute the same benchmark input scope.
- [x] V2 tool and retrieval behavior is deterministic.
- [x] V3 reflects selective route, grounding, tool, and safety behavior.
- [x] No delivery, approval action, or mutable commerce side effect occurs.
- [x] Trellis Check, lint, type-check, and tests pass.

## Out of Scope

- Live provider comparison and production runtime delivery.
