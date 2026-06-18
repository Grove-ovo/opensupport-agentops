# Phase 2 Dependency Breakdown

## Source Constraints

The source PRD fixes the Phase 2 architecture:

- code-first routing
- conditional LLM agents
- deterministic tools
- PostgreSQL full-text search plus pgvector
- evidence-gated policy answers
- rule-first risk decisions
- tenant-scoped BYOK model calls
- asynchronous monitoring outside the online response path

ADR-001 and ADR-002 already select TypeScript, PostgreSQL, Redis, local
envelope encryption, immutable trace snapshots, layered gates, and application
state guards. Phase 2 must extend those contracts rather than select a new
stack.

## Current Repository Baseline

Phase 1 provides:

- canonical Chatwoot events
- tenant model configuration and encrypted key references
- LLM call logging and cost decision records
- PII masking
- immutable trace version snapshots and execution-state storage

Phase 2 does not yet have:

- an Agent pipeline context or route decision contract
- a provider invocation adapter
- policy document/chunk storage
- pgvector-enabled local runtime
- retrieval/evidence records
- tool manifests, calls, or mock services
- risk decisions
- grounded response generation

## Dependency Order

1. **Pipeline contracts and Code Router**
   establish stable intent, entity, route, clarification, and step-result
   shapes without network or LLM dependencies.
2. **Tenant LLM runtime and conditional Triage**
   consume Phase 1 BYOK, PII, trace, timeout, fallback, and LLM log contracts.
3. **Policy corpus and hybrid retrieval foundation**
   add versioned document/chunk storage, pgvector, ingestion, and tenant
   isolation.
4. **Evidence gate and RAG baseline**
   add merge, rerank, threshold, conflict detection, traceable evidence, and a
   small retrieval baseline report.
5. **Tool contracts and mock business services**
   add deterministic schema validation, tenant/contact permission,
   idempotency, retry, audit, and refund dry-run behavior.
6. **Risk Guardrail**
   evaluates input, evidence, tool intent/result, and sensitive actions using
   deterministic rules before optional model judgment.
7. **Response Agent and Phase 2 integration**
   produces a grounded suggestion from immutable versions, evidence, tool
   results, and risk decisions. Runtime mode execution remains Phase 3.

## Boundary Decisions

- Phase 2 creates a response proposal, not a Chatwoot public reply.
- Phase 2 may return handoff/clarification/private-note recommendations, but
  Shadow/Assist/Auto transition execution and approvals remain Phase 3.
- Refund remains dry-run only.
- Monitor Agent, full replay/security eval, release gates, benchmark suites,
  dashboards, and real ecommerce adapters remain later phases.
- The first child task is deterministic and testable without provider keys,
  policy corpora, Docker changes, or network access.
