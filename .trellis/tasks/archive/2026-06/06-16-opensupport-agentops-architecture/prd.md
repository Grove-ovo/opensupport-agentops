---
artifact: prd
version: "2.0"
created: 2026-06-16
updated: 2026-06-18
status: accepted
source: ../../../../OpenSupport_AgentOps_PRD.md
---

# PRD: Phase 1 Foundation Integration

## Goal

Integrate and verify the five completed Phase 1 delivery slices from the
original OpenSupport AgentOps PRD:

- local runtime and PostgreSQL foundation
- Chatwoot canonical event ingestion
- tenant-scoped BYOK model configuration
- LLM call logging and cost governance seed
- PII masking and immutable trace schema

This parent task closes the Phase 1 foundation as one coherent, reproducible
baseline. It does not add user registration or pull Phase 2-5 capabilities
into the current release.

## Requirements

- Preserve a single ordered, idempotent PostgreSQL migration path for all
  Phase 1 schema changes.
- Verify the minimum tenant-ready tables and constraints required by Phase 1.
- Verify that Agent Bot and account webhook inputs converge on one canonical
  Chatwoot event contract and one pipeline seed.
- Verify tenant-scoped model configuration, encrypted BYOK references,
  immutable config versions, timeout, fallback, and budget fields.
- Verify LLM call logs capture model, prompt version, latency, token usage,
  estimated cost, error code, and cost-governance reason fields.
- Verify PII masking is callable before any provider request and preserves
  operational identifiers such as order IDs.
- Verify trace creation freezes a tenant-consistent version snapshot for later
  Agent pipeline execution.
- Keep the Phase 1 documentation, package exports, tests, migration scripts,
  database verification scripts, and Trellis task records consistent.
- Add one parent-level integration validation command that detects missing or
  disconnected Phase 1 artifacts.

## Acceptance Criteria

- [x] AC-1: Phase 1 migrations `0001` through `0004` execute in order and are
  idempotent on PostgreSQL with pgvector.
- [x] AC-2: The Phase 1 base schema includes `tenants`,
  `chatwoot_connections`, `tenant_model_configs`, `agent_traces`,
  `llm_call_logs`, and `audit_logs`.
- [x] AC-3: Chatwoot signatures are verified, self-outgoing events are
  ignored, and Agent Bot/account webhook duplicates produce one canonical
  pipeline seed.
- [x] AC-4: `TenantModelConfig` supports provider and model roles, timeout,
  fallback, ticket/daily budget, encrypted API-key reference, and immutable
  version identity.
- [x] AC-5: `LLMCallLog` persists model name, prompt version, latency, token
  usage, estimated cost, error code, and currency-safe cost values.
- [x] AC-6: PII masking covers phone, email, address, government ID, and bank
  card categories before future LLM calls without masking order identifiers.
- [x] AC-7: `AgentTrace` stores immutable version snapshot fields and rejects
  cross-tenant version references.
- [x] AC-8: Required Phase 1 documents exist and match the implemented
  contracts: `docs/chatwoot_connector.md`, `docs/tenant_model_config.md`,
  `docs/llm_observability.md`, and `docs/trace_schema.md`.
- [x] AC-9: Phase 1A through Phase 1E Trellis children are archived as
  completed and remain linked from this parent task.
- [x] AC-10: `npm run lint`, `npm run typecheck`, `npm test`, Docker Compose
  validation, Trellis validation, migration execution, and database
  verification pass.
- [x] AC-11: User registration, full SaaS account/RBAC, RAG, Agent runtime,
  tools, approvals, eval, release gates, dashboard implementation, and real
  ecommerce adapters remain outside this task.

## Phase 1 Child Tasks

| Task | Scope | Trellis Task | Status |
|------|-------|--------------|--------|
| Phase 1A | Local runtime + database foundation | `06-16-phase-1a-local-runtime-database-foundation` | Completed |
| Phase 1B | Chatwoot connector | `06-16-phase-1b-chatwoot-connector` | Completed |
| Phase 1C | Tenant config + BYOK model config | `06-16-phase-1c-tenant-byok-model-config` | Completed |
| Phase 1D | LLM call logging + cost governance seed | `06-16-phase-1d-llm-call-logging-cost-governance` | Completed |
| Phase 1E | PII mask + trace schema | `06-16-phase-1e-pii-mask-trace-schema` | Completed |

## Technical Approach

The parent integration task does not introduce another runtime abstraction. It
adds an executable repository-level validation that checks the Phase 1
contract is connected end to end:

1. required migrations and verification scripts exist
2. root scripts execute all Phase 1 validation suites
3. required packages and documentation are present
4. all five child tasks are archived as completed
5. the parent PRD retains the intended Phase 1 boundary

Runtime and storage behavior continue to follow the child task implementations
and ADR-001/ADR-002. PostgreSQL remains canonical, Redis is infrastructure for
future online processing, and no workflow engine or external secret manager is
introduced in Phase 1.

## Decision (ADR-lite)

**Context**: The Phase 1 capabilities were intentionally delivered as five
small feature branches. Closing only the children would leave no executable
proof that their scripts, schemas, packages, documents, and Trellis records
form one release baseline.

**Decision**: Use this parent task as a lightweight integration gate. Add a
static Phase 1 repository validator, then run the full TypeScript, PostgreSQL,
Docker Compose, and Trellis quality gates.

**Consequences**: Phase 1 gains a repeatable acceptance command without adding
production runtime complexity. The validator must be updated when a future
migration or Phase 1 artifact is intentionally renamed.

## Project Roadmap

The full source PRD remains the project blueprint. Later phases remain
independent future Trellis tasks:

1. Phase 2: Agent + RAG + Tools
2. Phase 3: Runtime Modes + Approval
3. Phase 4: Eval + Release Gate
4. Phase 5: Benchmark + Load Test

## Out of Scope

- User registration API.
- Full SaaS workspace/account system and complete RBAC.
- RAG ingestion and retrieval.
- Agent planning, routing, tool execution, and response generation.
- Runtime modes and approval queue execution.
- Replay Eval, Security Eval, Release Gate, and failure-bucket processing.
- Dashboard pages.
- Real Shopify, WooCommerce, Taobao, JD, or other marketplace adapters.
- External secret manager and workflow engine adoption.

## Definition of Done

- Parent integration validator is included in the root test suite.
- All Phase 1 package and static validation tests pass.
- TypeScript build/type-check and lint pass.
- Docker Compose configuration resolves.
- PostgreSQL migrations are idempotent and all Phase 1 database verification
  scripts pass against the local database.
- Trellis validation passes for this parent task.
- Architecture, ADRs, Phase 1 docs, specs, and task metadata have no conflicting
  technical direction.
- Changes are committed on `feat/phase-1-foundation-integration` from `dev`.

## References

- Source PRD: `OpenSupport_AgentOps_PRD.md`
- Architecture: `docs/architecture.md`
- ADR-001: `docs/adr/ADR-001-opensupport-agentops-mvp-architecture.md`
- ADR-002: `docs/adr/ADR-002-controlled-launch-architecture.md`
