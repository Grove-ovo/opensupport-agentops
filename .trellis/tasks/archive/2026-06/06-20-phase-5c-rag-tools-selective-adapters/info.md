# Technical Design

Add V2/V3 adapter implementations using existing case intent, evidence, tool,
risk, and runtime contracts. V3 reuses existing deterministic project logic
where possible without invoking online side effects.

## Implementation

- Added a deterministic V2 RAG+Tools single-flow adapter.
- Added a V3 adapter that runs the existing `runAgentPipeline` with injected
  deterministic triage, evidence, mock tool result, response, and clock
  boundaries.
- Preserved high-risk Assist, clarification Shadow, and blocking handoff
  behavior while preventing delivery, approval, and mutable commerce effects.
- Added same-scope comparison tests across the committed test split.

## Verification

- `npm run test:phase5c`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `python3 ./.trellis/scripts/task.py validate 06-20-phase-5c-rag-tools-selective-adapters`
