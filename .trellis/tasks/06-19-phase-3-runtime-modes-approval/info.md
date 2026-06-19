# Technical Design: Phase 3 - Runtime Modes + Approval

Status: Accepted for iterative delivery
Date: 2026-06-19
Base branch: `dev`

## Boundary

Phase 2 owns proposal generation. Phase 3 owns requested/effective runtime mode
decisions, state transitions, approval persistence, Chatwoot side effects, and
their audit records.

## Data Flow

```text
AgentPipelineRun
  -> RuntimeModeDecision
  -> TicketExecution transition
  -> Shadow: private note
  -> Assist: immutable ApprovalRequest
  -> Auto: guarded public reply
  -> delivery/approval/transition audit
```

## Core Rules

- Trace `runtime_mode` and version snapshot remain immutable.
- Effective mode and downgrade reason are separate decision records.
- State transitions use expected-state compare-and-set semantics.
- Side-effect commands require stable idempotency keys.
- Approval snapshots are immutable after creation.
- Approval terminal states cannot transition again.
- Public delivery requires either an Auto allow decision or an
  approved/edited Assist action.

## Delivery Sequence

1. Phase 3A: execution state machine foundation
2. Phase 3B: runtime mode decision engine
3. Phase 3C: Chatwoot runtime delivery
4. Phase 3D: approval snapshot persistence
5. Phase 3E: approval actions and human edit tracking
6. Phase 3F: integration and parent acceptance
