---
artifact: prd
version: "1.0"
created: 2026-06-18
status: accepted
parent: ../06-18-phase-2-agent-rag-tools
---

# PRD: Phase 2A - Agent Pipeline Contracts + Code Router

## Goal

Create the deterministic entry point for the Phase 2 Agent pipeline. Define
shared, provider-independent contracts and route PII-masked customer messages
without network, database, model, RAG, or tool dependencies.

## Requirements

- Add shared contracts for `AgentIntent`, `AgentPipelineContext`,
  `RouteDecision`, `PipelineStepResult`, route capabilities, extracted entities,
  sensitive signals, and reason codes.
- Support the eight intents fixed by the source PRD.
- Accept only PII-masked provider-bound text plus trace/tenant/ticket identity.
- Detect labelled Chinese/English order IDs without returning raw customer text.
- Detect deterministic route signals for order, logistics, refund eligibility,
  refund request, return policy, invoice, complaint escalation, and unknown.
- Mark ambiguous or conflicting cases as `triage_required`.
- Emit required downstream capabilities such as `rag`, `order_tool`,
  `logistics_tool`, `refund_tool`, and `handoff`.
- Detect sensitive terms relevant to approval bypass, direct refund execution,
  credential disclosure, system-prompt disclosure, and cross-account access.
- Keep results deterministic, serializable, trace-safe, and free of provider
  payloads or secrets.
- Document the contract and routing precedence in `docs/agent_pipeline.md`.

## Core Interfaces

```text
AgentPipelineContext
  trace_id
  tenant_id
  ticket_id
  conversation_id
  message_id
  masked_text
  runtime_mode
  version_snapshot
  deadline_at

RouteDecision
  intent
  confidence
  route
  entities
  required_capabilities
  sensitive_signals
  triage_required
  reason_codes

PipelineStepResult<T>
  status
  data
  reason_code
  started_at
  completed_at
```

Exact TypeScript naming may follow repository conventions, but these semantics
must not change.

## Acceptance Criteria

- [ ] Clear order-status, logistics, refund, return-policy, invoice, and
  complaint examples route without an LLM call.
- [ ] Unknown, conflicting, or underspecified messages require conditional
  triage.
- [ ] Labelled Chinese and English order IDs are extracted and normalized.
- [ ] Sensitive signals are emitted independently of the selected intent.
- [ ] Routing precedence is deterministic and repeated input produces deeply
  equal output.
- [ ] Router output does not include the complete customer message, raw PII,
  replacement maps, secrets, or provider payloads.
- [ ] Invalid IDs, blank masked text, invalid deadlines, and unsupported runtime
  modes return structured validation errors.
- [ ] Shared exports and package exports compile without circular dependencies.
- [ ] Unit tests cover Chinese/English examples, ambiguous/conflicting intent,
  multiple order IDs, sensitive terms, and validation failures.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and Trellis validation
  pass.

## Technical Approach

- Add shared data contracts under `packages/shared`.
- Add deterministic routing implementation under `packages/agent-core`.
- Use ordered rules and explicit reason codes; do not use keyword scores whose
  precedence changes with object iteration.
- Validate context at the boundary and keep `masked_text` transient.
- Return routing metadata suitable for appending to `agent_traces`, but do not
  add persistence in this task.

## Out of Scope

- LLM/provider calls and Triage Agent execution.
- RAG ingestion, retrieval, evidence scoring, or pgvector changes.
- Tool planning/execution and mock services.
- Risk gate decisions beyond emitting sensitive signals.
- Response generation.
- Trace persistence updates or new migrations.
- Runtime-mode transitions, approval records, or Chatwoot sending.

## Definition of Done

- Shared contracts and deterministic router package are implemented.
- `docs/agent_pipeline.md` documents precedence, contracts, and examples.
- Root test/build scripts include the new package.
- Tests and Trellis Check pass.

## References

- Parent PRD: `../06-18-phase-2-agent-rag-tools/prd.md`
- `OpenSupport_AgentOps_PRD.md` sections 9 and 19
- `docs/architecture.md` Agent Design
- `docs/trace_schema.md`
