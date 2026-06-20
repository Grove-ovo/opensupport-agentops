---
artifact: adr
version: "1.0"
created: 2026-06-16
status: proposed
---

# ADR-001: Adopt TypeScript Monorepo for Chatwoot-Centered AgentOps MVP

## Status

Proposed

**Date:** 2026-06-16  
**Deciders:** Grove-ovo, Codex AI PM

## Context

The source PRD defines OpenSupport AgentOps as a tenant-ready ecommerce after-sales support AgentOps MVP based on Chatwoot. The MVP must demonstrate a real customer support integration, BYOK model governance, RAG evidence gates, typed business tools, Shadow/Assist/Auto runtime modes, approval workflow, traces, replay eval, security eval, release gate, and cost governance.

The project has been initialized with npm and Trellis. The repository currently has no application code, so the first architecture decision should establish a practical implementation shape that supports both dashboard and backend development while keeping the MVP small enough to deliver in 4-6 weeks.

The source PRD has several open architecture questions:

- Whether Chatwoot Agent Bot, account webhook, or both should be used.
- Whether model API keys should use local encryption or external secret manager in MVP.
- Whether hybrid retrieval should use PostgreSQL/pgvector or Qdrant.
- Whether the Monitor Agent belongs in P0.
- What demo budget defaults should be used.

## Decision

We will build the MVP as a TypeScript monorepo with these top-level areas:

- `apps/api` for the AgentOps backend service.
- `apps/web` for the dashboard.
- `packages/shared` for shared schemas and constants.
- `packages/chatwoot` for Chatwoot connector logic.
- `packages/agent-core` for code router, conditional agents, risk, runtime mode, and response orchestration.
- `packages/rag` for hybrid retrieval and evidence gating.
- `packages/tools` for MCP-compatible typed tool contracts and mock business service adapters.
- `packages/eval` for replay eval, security eval, benchmark, and release gate helpers.

We will use Chatwoot Agent Bot as the primary online invocation path and account webhooks as the audit/synchronization event stream.

We will use PostgreSQL as the system of record and combine PostgreSQL full-text search with pgvector for MVP hybrid retrieval. Local development and demos will run local PostgreSQL with pgvector. Staging and production deployments will use managed cloud PostgreSQL with pgvector. Redis will be used for delivery dedupe, idempotency, async coordination, and rate limiting.

We will store tenant BYOK keys as encrypted references in MVP using local envelope encryption, with production external secret manager integration deferred to P1.

We will include a minimal async Monitor Agent in P0 as a failure bucket classifier. It will not block online response latency.

The default demo budget assumptions are:

- `max_cost_per_ticket = 0.02`
- `daily_budget = 5.0`

## Consequences

### Positive

- Shared TypeScript schemas reduce frontend/backend contract drift.
- A monorepo keeps package boundaries explicit without introducing early distributed-system overhead.
- PostgreSQL plus pgvector simplifies local demos, migrations, tenant isolation, and trace/eval joins.
- Keeping local and cloud on PostgreSQL avoids schema drift and lets deployments switch through `DATABASE_URL`.
- Agent Bot plus account webhooks gives both online invocation and audit coverage.
- Minimal BYOK encryption demonstrates the right safety principle without blocking on cloud secret infrastructure.
- Async Monitor Agent satisfies the PRD's failure analysis need without slowing customer responses.

### Negative

- TypeScript is less common than Python for some RAG and eval tooling, so some AI workflow libraries may be less mature or need thin wrappers.
- PostgreSQL/pgvector may be less specialized than a dedicated vector database for large-scale retrieval.
- Local encryption is not enough for production-grade secret management.
- A monorepo can still grow messy if package boundaries are not enforced during implementation.

### Neutral

- Future productionization can extract workers, introduce Qdrant, add a real secret manager, or split services without invalidating MVP data contracts.

## Alternatives Considered

### Python FastAPI Backend + React Frontend

This would align well with common LLM/RAG tooling and Pydantic schemas. It was not chosen as the initial direction because the project was initialized with npm, needs a dashboard and backend, and benefits from shared TypeScript contracts across API, web, tools, and eval helpers.

### Separate Backend, Frontend, Worker, and Eval Repositories

This would create stricter ownership boundaries. It was not chosen for MVP because it adds coordination overhead before product behavior is proven.

### Qdrant + Separate BM25 Service

This could become stronger for retrieval at scale. It was not chosen for MVP because PostgreSQL full-text search plus pgvector is simpler for local setup, tenant scoping, migrations, and trace/eval correlation.

### Agent Bot Only

This is simpler but loses coverage over account-level event auditing and synchronization. The MVP keeps Agent Bot primary but captures account webhooks as the audit stream.

### Account Webhook Only

This centralizes all event handling but is less directly aligned with Chatwoot's bot invocation model. It was not chosen as the primary path.

## References

- Source PRD: `OpenSupport_AgentOps_PRD.md`
- Architecture: `docs/architecture.md`
- Task PRD: `.trellis/tasks/06-16-opensupport-agentops-architecture/prd.md`
