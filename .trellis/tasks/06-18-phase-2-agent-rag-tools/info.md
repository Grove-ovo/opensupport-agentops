# Technical Design: Phase 2 - Agent + RAG + Tools

Status: Completed and verified
Date: 2026-06-18
Base branch: `dev`

## Architecture Boundary

Phase 2 owns pipeline reasoning, evidence retrieval, deterministic business
tools, risk decisions, and a response proposal. Phase 3 owns runtime-mode
delivery, approval state, and public/private Chatwoot side effects.

## Shared Data Flow

```text
canonical event
  -> PII-safe trace seed
  -> RouteDecision
  -> optional TriageDecision
  -> EvidenceBundle
  -> ToolPlan / ToolResult[]
  -> GateDecision[]
  -> ResponseProposal
```

Every object is tenant-scoped and references the active trace. Provider raw
payloads, plaintext credentials, raw customer text, and replacement maps are
not valid pipeline fields.

## Core Contracts To Stabilize

```text
AgentPipelineContext
RouteDecision
TriageDecision
EvidenceRef
EvidenceBundle
ToolManifest
ToolCallRequest
ToolCallResult
GateDecision
ResponseProposal
PipelineStepResult<T>
```

## Delivery Sequence

1. Phase 2A: contracts and deterministic Code Router
2. Phase 2B: LLM runtime adapter and conditional Triage
3. Phase 2C: policy corpus and hybrid retrieval storage
4. Phase 2D: RAG evidence gate and baseline report
5. Phase 2E: tool contracts and mock services
6. Phase 2F: layered Risk Guardrail
7. Phase 2G: Response Agent and integration

## Cross-Cutting Rules

- PII masking occurs before any model boundary.
- BYOK plaintext exists only during one provider call.
- Model calls use immutable model config and prompt versions.
- RAG and tools use tenant/contact authorization.
- Every step has a deadline and explicit error/degrade result.
- Blocking gate decisions prevent response proposals from claiming success.
- Phase 2 emits a recommended action; Phase 3 performs runtime-mode delivery.

## Final Delivery

All seven child tasks are archived and integrated. The parent verification
covers shared contracts, router, LLM runtime, retrieval storage, RAG evidence,
mock tools, layered guardrails, response orchestration, documentation, tests,
Compose configuration, idempotent migrations, and live PostgreSQL checks.

The Phase 2 output remains proposal-only. Phase 3 owns Shadow/Assist/Auto
delivery, approvals, and Chatwoot side effects.

## References

- Parent PRD: `prd.md`
- Dependency analysis: `research/dependency-breakdown.md`
- Source architecture: `docs/architecture.md`
- Phase 1 trace contract: `docs/trace_schema.md`
