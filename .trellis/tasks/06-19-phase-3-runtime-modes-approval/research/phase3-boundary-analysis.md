# Phase 3 Boundary Analysis

## Existing Inputs

- Phase 2 emits `AgentPipelineRun`, `ResponseProposal`, risk decisions,
  grounding references, cost, latency, and trace append values.
- `agent_traces.runtime_mode` and version snapshots are immutable.
- `agent_traces.execution_state` already supports the controlled-launch state
  names but has no transition guard.
- Chatwoot currently owns inbound normalization only; outbound delivery is not
  implemented.

## Required Additions

- Pure transition and runtime-decision contracts.
- PostgreSQL transition enforcement and append-only transition audit.
- Versioned tenant runtime mode configuration.
- Outbound Chatwoot adapter with idempotent private/public message commands.
- Immutable approval request snapshots and terminal action audit.
- A runtime orchestrator that composes these boundaries without moving
  generation responsibilities out of Phase 2.

## Recommended Decomposition

Keep state, decision, delivery, approval creation, approval actions, and final
integration in separate tasks. This prevents Auto delivery from being added
before state/idempotency controls and lets approval persistence be tested
without depending on a frontend.

## Deferred Work

Approval Queue UI, full RBAC, eval/release gates, monitor jobs, and real
commerce mutations belong to later phases.
