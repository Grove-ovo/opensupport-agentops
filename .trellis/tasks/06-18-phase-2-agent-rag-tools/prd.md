---
artifact: prd
version: "1.0"
created: 2026-06-18
status: accepted
source: ../../../OpenSupport_AgentOps_PRD.md
---

# PRD: Phase 2 - Agent + RAG + Tools

## Goal

Build the original PRD's second milestone as a selective, controllable Agent
pipeline: deterministic routing, conditional model triage, evidence-gated RAG,
typed tools backed by mock business services, rule-first risk decisions, and a
grounded response proposal.

Phase 2 consumes the completed Phase 1 foundation. It does not execute
Shadow/Assist/Auto delivery behavior or approvals; those remain Phase 3.

## Requirements

- Define shared Agent pipeline contracts before implementing individual steps.
- Implement a deterministic Code Router for supported intents, order-ID
  extraction, sensitive-term detection, and conditional-triage decisions.
- Implement tenant-scoped model invocation using immutable model config,
  ephemeral BYOK decryption, PII-safe inputs, timeout/fallback handling, and
  Phase 1 LLM call logging.
- Invoke the Triage Agent only when deterministic routing is ambiguous.
- Add versioned tenant policy documents and chunks using PostgreSQL full-text
  search plus pgvector.
- Implement hybrid retrieval, merge, rerank, threshold, conflict detection,
  and evidence IDs.
- Block definitive policy claims when no valid evidence exists.
- Implement MCP-compatible tool contracts and deterministic mock order,
  logistics, refund-eligibility, refund dry-run, and handoff services.
- Validate tool schema, tenant/contact ownership, permission, risk, timeout,
  retry, idempotency, and audit fields before execution.
- Implement a rule-first Risk Guardrail across input, retrieval, tool, and
  output boundaries.
- Generate a grounded response proposal from evidence and tool results while
  retaining immutable trace/version references.
- Enforce per-step deadlines and return explicit clarification, handoff, or
  degraded recommendations when a dependency fails.

## Supported Intents

```text
order_status
logistics_query
refund_eligibility
refund_request
return_policy
invoice_request
complaint_escalation
unknown
```

## Acceptance Criteria

- [ ] AC-1: A canonical customer message and trace seed can enter a typed Agent
  pipeline context without raw PII or plaintext credentials.
- [ ] AC-2: The Code Router produces deterministic intent, entities, route,
  sensitive flags, and triage-required decisions.
- [ ] AC-3: Ambiguous cases may use tenant-scoped conditional triage; clear
  cases do not incur an LLM call.
- [ ] AC-4: Every model call applies timeout/fallback rules and records the
  Phase 1 LLM observability contract.
- [ ] AC-5: Policy retrieval is tenant-scoped, versioned, hybrid
  full-text/vector, and returns traceable evidence IDs and scores.
- [ ] AC-6: No-evidence and conflicting-evidence cases cannot produce a
  definitive policy claim.
- [ ] AC-7: Tool execution is schema-validated, permission-checked,
  tenant-scoped, idempotent, audited, and deterministic.
- [ ] AC-8: Refund operations are dry-run only and duplicate requests return
  the existing result/status.
- [ ] AC-9: Risk rules can block, sanitize, clarify, or recommend handoff for
  prompt injection, unauthorized order access, unsafe tool intent, and
  evidence failures.
- [ ] AC-10: The Response Agent proposal cites required evidence and tool
  result references and cannot bypass a blocking gate.
- [ ] AC-11: Pipeline steps append traceable results and respect explicit
  deadlines without implementing Phase 3 runtime-mode delivery.
- [ ] AC-12: Required artifacts exist: `docs/rag_pipeline.md`,
  `docs/tool_contract.md`, and `reports/rag_eval_baseline.md`.
- [ ] AC-13: Phase 2A through Phase 2G exist as independently executable
  Trellis child tasks.

## Child Task Plan

| Task | Scope | Dependency |
|------|-------|------------|
| Phase 2A | Shared Agent pipeline contracts + deterministic Code Router | Phase 1 |
| Phase 2B | Tenant LLM runtime adapter + conditional Triage Agent | 2A |
| Phase 2C | Versioned policy corpus + PostgreSQL FTS/pgvector foundation | Phase 1 |
| Phase 2D | Hybrid RAG evidence pipeline + baseline retrieval report | 2A, 2C |
| Phase 2E | MCP-compatible tool contracts + mock business services | 2A |
| Phase 2F | Rule-first Risk Guardrail and layered gate decisions | 2A, 2D, 2E |
| Phase 2G | Response Agent + Phase 2 pipeline integration | 2B, 2D, 2E, 2F |

## Current Execution Focus

Only **Phase 2A** is the first implementation task:

- shared intent/entity/route/result contracts
- deterministic order ID and sensitive-term extraction
- Code Router decision rules
- conditional-triage flag
- trace-safe route result

Phase 2A must not add model provider calls, RAG storage/retrieval, tools,
runtime modes, approvals, or Chatwoot message sending.

## Technical Approach

Use a code-first pipeline with explicit step input/output contracts:

```text
CanonicalInboundEvent + PIIMaskResult + AgentTrace
  -> Code Router
  -> optional Triage
  -> RAG Evidence
  -> Tool Plan / Tool Result
  -> Risk Decision
  -> Response Proposal
```

Each step returns data owned by OpenSupport AgentOps, never provider-specific
payloads. Steps reference immutable version IDs from the trace snapshot.
Online processing includes only response-critical work; monitoring and later
eval materialization remain asynchronous.

## Decision (ADR-lite)

**Context**: Implementing Response Agent or a broad autonomous agent first
would couple model behavior, retrieval, tools, and risk handling before stable
contracts exist.

**Decision**: Deliver Phase 2 as seven dependency-ordered Trellis children.
Start with deterministic pipeline contracts and Code Router. Keep Triage
conditional, tools deterministic, and risk rules authoritative.

**Consequences**: Early tasks remain locally testable and later model/provider
work plugs into stable contracts. More integration work is deferred to Phase
2G, but failures can be isolated to one owned boundary.

## Out of Scope

- Shadow/Assist/Auto state transition execution.
- Approval requests and human edit tracking.
- Public Chatwoot reply sending.
- Monitor Agent implementation.
- Full Replay Eval, Security Eval, and Release Gate.
- Benchmark/load-test comparison across architecture variants.
- Real Shopify, WooCommerce, Taobao, JD, or marketplace APIs.
- Real refund execution.
- External workflow engine, vector database, or secret manager.
- Dashboard UI.

## Definition of Done

- Phase 2A-2G child tasks are linked and have clear dependency boundaries.
- Each child task passes lint, type-check, owned tests, and Trellis validation.
- New migrations are idempotent and pass live PostgreSQL verification.
- Model, retrieval, tool, gate, and response records are tenant-consistent and
  traceable through immutable version references.
- Required Phase 2 docs and the RAG baseline report exist.
- Parent integration validation proves every child and artifact is connected.

## Research Reference

- `research/dependency-breakdown.md`

## References

- `OpenSupport_AgentOps_PRD.md`
- `docs/architecture.md`
- `docs/adr/ADR-001-opensupport-agentops-mvp-architecture.md`
- `docs/adr/ADR-002-controlled-launch-architecture.md`
- `.trellis/tasks/archive/2026-06/06-16-opensupport-agentops-architecture/prd.md`
