---
artifact: prd
version: "1.0"
created: 2026-06-16
status: proposed
source: ../../../../OpenSupport_AgentOps_PRD.md
---

# PRD: Phase 1 - Chatwoot + Tenant + BYOK Foundation

## Goal

Build the first executable foundation slice from the original OpenSupport
AgentOps PRD: local runtime foundations, Chatwoot connector contracts,
tenant-ready configuration, BYOK model configuration, LLM call logging, PII
masking, and trace schema.

This task intentionally narrows the project from the full AgentOps platform to
the original PRD Phase 1 milestone. It does not implement user registration.
The earlier registration example is explicitly out of scope.

## Requirements

- Provide local development foundation guidance for AgentOps API, PostgreSQL,
  Redis, and Chatwoot.
- Use PostgreSQL as the canonical database engine across environments: local
  PostgreSQL with pgvector for development/demo, managed cloud PostgreSQL with
  pgvector for deployed staging/production.
- Define the tenant-ready minimum data model for Phase 1.
- Define Chatwoot connection configuration and connector contracts.
- Define canonical inbound event and dedupe behavior for Agent Bot and account
  webhook inputs.
- Define tenant-scoped BYOK model configuration with encrypted API key
  references.
- Define LLM call logging fields for latency, token usage, estimated cost,
  prompt version, model name, and error code.
- Define PII masking behavior that must run before future LLM calls.
- Define trace schema that can seed later Agent pipeline steps.
- Preserve controlled launch architecture decisions from ADR-002 as Phase 1
  constraints where relevant.
- Split Phase 1 into independent child tasks that can be implemented
  iteratively.

## Acceptance Criteria

- AC-1: Current task PRD no longer implies user registration as Phase 1 scope.
- AC-2: Phase 1 maps directly to the original PRD milestone "Chatwoot + Tenant
  + BYOK".
- AC-3: Non-core requirements are explicitly deferred to later project phases.
- AC-4: Chatwoot events can be designed to be verified, deduped, normalized,
  and stored through a canonical inbound event contract.
- AC-5: Tenant model config can represent BYOK provider, model roles, budget,
  timeout, fallback model, and encrypted API key reference.
- AC-6: LLM call logs can record latency, token usage, estimated cost, prompt
  version, model name, and error code.
- AC-7: PII masking can run before any future LLM call.
- AC-8: Agent trace schema can seed later Agent pipeline steps.
- AC-9: Trellis child tasks exist for Phase 1A through Phase 1E.
- AC-10: Parent task remains in `planning` until the narrowed Phase 1 PRD is
  accepted.

## Phase 1 Child Tasks

| Task | Scope | Trellis Task |
|------|-------|--------------|
| Phase 1A | Local runtime + database foundation | `06-16-phase-1a-local-runtime-database-foundation` |
| Phase 1B | Chatwoot connector | `06-16-phase-1b-chatwoot-connector` |
| Phase 1C | Tenant config + BYOK model config | `06-16-phase-1c-tenant-byok-model-config` |
| Phase 1D | LLM call logging + cost governance seed | `06-16-phase-1d-llm-call-logging-cost-governance` |
| Phase 1E | PII mask + trace schema | `06-16-phase-1e-pii-mask-trace-schema` |

## Project Roadmap

The full source PRD remains the product blueprint. Later phases are deferred
from the current execution task:

1. Phase 2: Agent + RAG + Tools
2. Phase 3: Runtime Modes + Approval
3. Phase 4: Eval + Release Gate
4. Phase 5: Benchmark + Load Test

Each deferred phase should become its own Trellis task or task group after
Phase 1 is accepted and implemented.

## Out of Scope

- User registration API.
- Full SaaS workspace/account system.
- Complete RBAC.
- RAG ingestion and retrieval.
- Agent pipeline and response generation.
- MCP tools.
- Runtime modes full execution.
- Approval queue.
- Replay Eval, Security Eval, and Release Gate implementation.
- Dashboard page implementation.
- Real Shopify, WooCommerce, Taobao, JD, or marketplace adapters.

## Technical Approach

Phase 1 establishes contracts and storage foundations, not the full agent
runtime. Data and interfaces defined here must remain reusable by later phases.

Core semantic shapes:

- `Tenant`: tenant identity and lifecycle.
- `ChatwootConnection`: tenant-scoped Chatwoot base URL, account ID, webhook
  secret reference, API token reference, and Agent Bot config.
- `TenantModelConfig`: provider, fast model, strong model, embedding model,
  fallback model, timeout, per-ticket budget, daily budget, encrypted API key
  reference.
- `CanonicalInboundEvent`: tenant ID, source, conversation ID, message ID, event
  type, dedupe key, payload hash, customer/self flags.
- `AgentTrace`: trace ID, tenant ID, ticket/conversation IDs, runtime mode
  placeholder, version snapshot, latency/cost fields, final action placeholder.
- `LLMCallLog`: model, prompt version, token usage, latency, estimated cost,
  error code.
- `AuditLog`: actor, action, decision, input/output hash, timestamp.
- `PIIMaskResult`: masked text plus detected PII categories.

Database environment rule:

- Local development and demo use local PostgreSQL with pgvector.
- Staging and production use managed cloud PostgreSQL with pgvector.
- The application must connect through `DATABASE_URL` and keep one schema,
  migration path, and data access layer across both environments.

Required Phase 1 artifacts:

- `docs/chatwoot_connector.md`
- `docs/tenant_model_config.md`
- `docs/trace_schema.md`

## Definition of Done

- Phase 1A-1E child task PRDs exist.
- Parent task PRD is narrowed to Phase 1 only.
- User registration remains explicitly out of scope.
- Original full PRD phase roadmap is retained as deferred work.
- Trellis validation passes.
- No implementation task is started until this narrowed PRD is accepted.

## References

- Source PRD: `OpenSupport_AgentOps_PRD.md`
- Architecture: `docs/architecture.md`
- ADR-001: `docs/adr/ADR-001-opensupport-agentops-mvp-architecture.md`
- ADR-002: `docs/adr/ADR-002-controlled-launch-architecture.md`
