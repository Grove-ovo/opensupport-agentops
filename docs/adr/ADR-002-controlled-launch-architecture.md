---
artifact: adr
version: "1.0"
created: 2026-06-16
status: proposed
---

# ADR-002: Adopt Controlled Launch Architecture

## Status

Proposed

**Date:** 2026-06-16  
**Deciders:** Grove-ovo, Codex AI PM

## Context

The OpenSupport AgentOps PRD requires more than a functional chatbot. The MVP
must support safe gradual rollout through Shadow, Assist, and Auto modes; prevent
unsafe tool actions; preserve traceability; run replay and security evals; and
block release promotion when quality or safety regresses.

The initial architecture covered the major modules, but it did not fully define
how runtime behavior remains controllable when the same Chatwoot message can
arrive through Agent Bot and account webhooks, when a ticket changes runtime
mode, when an operator edits an approval, or when a release candidate is
evaluated against changing prompts, policies, tools, risk rules, and model
configs.

## Decision

We will use a controlled launch architecture built on:

- canonical inbound events
- explicit state machines
- immutable version snapshots
- layered gate decisions
- strict online/async separation

Agent Bot remains the primary online invocation path. Account webhooks remain
the audit and synchronization stream. Both sources pass through the same
canonical inbound event layer. A pipeline execution can start only from a
canonical incoming customer message.

We will implement state machines for:

- `TicketExecution`
- `ApprovalRequest`
- `ReleaseCandidate`

MVP state transitions are enforced by application transition guards and
PostgreSQL state fields. We will not introduce a full workflow engine in P0.

Every trace records a `TraceVersionSnapshot` containing:

- `agent_version_id`
- `prompt_version_id`
- `policy_version_id`
- `tool_manifest_version_id`
- `risk_rule_version_id`
- `retrieval_config_version_id`
- `model_config_version_id`

Release Gate evaluates immutable `ReleaseCandidateSnapshot` records, not mutable
live configuration.

Every gate returns a standard `GateDecision` with:

- `gate_name`
- `decision`
- `reason_code`
- `severity`
- `blocking`

The security model is split into input, retrieval, tool, and output gates.

## Consequences

### Positive

- Duplicate Chatwoot deliveries cannot produce duplicate pipeline actions.
- Shadow, Assist, and Auto behavior becomes auditable and testable.
- Release Gate results are reproducible because candidates point to immutable
  config snapshots.
- Approval decisions can be reviewed later against the exact generated reply,
  evidence, tool results, and risk reason shown to the operator.
- Blocking security failures can consistently prevent Auto replies and Auto
  promotion.

### Negative

- Initial data modeling becomes stricter because trace, approval, and release
  records must carry versioned references.
- Application code must enforce state transitions rather than relying on loose
  status updates.
- More test cases are required before the first vertical slice can be considered
  safe.

### Neutral

- A workflow engine can be added later if state transitions grow beyond the MVP.
- External secret manager, Qdrant, and canary rollout remain P1 options and do
  not change the controlled launch contract.

## Alternatives Considered

### Module-Level Control Only

The initial architecture listed modules and responsibilities but left execution
control implicit. This is insufficient for safe Auto Mode because duplicate
events, late approvals, mutable config, and partial failures need deterministic
handling.

### Full Workflow Engine in P0

A workflow engine would make state transitions explicit, but it adds operational
overhead before the MVP proves value. Application transition guards plus
PostgreSQL state fields are enough for the first version.

### Webhook-Only Event Processing

Using account webhooks as the only processing path would simplify canonical
event handling, but it gives up the direct Agent Bot online invocation model.
The chosen design keeps Agent Bot primary and uses webhooks for audit and sync.

## References

- Source PRD: `../../OpenSupport_AgentOps_PRD.md`
- Architecture: `../architecture.md`
- ADR-001: `ADR-001-opensupport-agentops-mvp-architecture.md`
- Task technical design: `../../.trellis/tasks/06-16-opensupport-agentops-architecture/info.md`
