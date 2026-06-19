# Technical Design

Status: Implemented and verified

`RuntimeOrchestrator` sits above `AgentPipelineRun` and composes the pure
runtime decision engine with the shared ticket state machine, approval
repository, and Chatwoot delivery adapter.

## Execution Mapping

- Shadow -> private note -> `private_noted`
- Assist -> immutable approval -> `waiting_approval`
- Auto -> public reply -> `replied`
- blocking/uncertain -> handoff or failed terminal state

The complete command is idempotent by tenant, trace, and execution key.
Service-specific keys remain stable for delivery, approval creation, and state
transition retries. `RuntimeExecutionAudit` links the decision, transition,
approval/delivery result, cost, latency, reason codes, failure, and input hash.

Phase 3F adds no database migration. It integrates the Phase 3A-3E application
contracts and validates the existing PostgreSQL migration chain.
