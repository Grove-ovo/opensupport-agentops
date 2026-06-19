# PRD: Phase 2G - Response Agent + Pipeline Integration

## Goal

Integrate Phase 2 components into one deadline-bound pipeline and generate a
grounded response proposal without performing Phase 3 delivery side effects.

## Requirements

- [x] Orchestrate router, optional triage, RAG, tools, risk gates, and response
  generation through typed step results.
- [x] Select fast/strong/fallback models by tenant config and risk.
- [x] Require evidence citations for policy claims and tool references for business
  state claims.
- [x] Append route, evidence, tool, risk, latency, token, cost, and final
  recommendation fields to the trace boundary.
- [x] Return reply, clarify, private-note, or handoff proposals for Phase 3.
- [x] Add parent-level Phase 2 integration validation.

## Acceptance Criteria

- Low-risk supported examples produce grounded response proposals.
- Missing evidence, unsafe tools, timeout, budget, and blocking risk decisions
  degrade without bypass.
- The pipeline never sends a Chatwoot message or creates an approval directly.
- Required Phase 2 docs/report and all child tasks are connected.
- Full tests, migrations, database verification, and Trellis Check pass.

## Dependencies

- Phase 2B
- Phase 2D
- Phase 2E
- Phase 2F

## Out of Scope

- Runtime-mode delivery, approval queue, Monitor Agent, release gates,
  benchmark/load tests, and dashboard UI.
