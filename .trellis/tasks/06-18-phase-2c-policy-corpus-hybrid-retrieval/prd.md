# PRD: Phase 2C - Policy Corpus + Hybrid Retrieval Foundation

## Goal

Add tenant-scoped, immutable policy versions and document chunks that support
PostgreSQL full-text search plus pgvector retrieval.

## Requirements

- [x] Enable pgvector in the local PostgreSQL runtime.
- [x] Add idempotent migrations for policy versions, documents, chunks, embeddings,
  and retrieval config versions.
- [x] Add deterministic chunking and ingestion contracts with content hashes.
- [x] Enforce tenant isolation, immutable published versions, embedding dimensions,
  and active-version rules.
- [x] Add lexical and vector candidate retrieval interfaces.

## Acceptance Criteria

- Re-ingesting unchanged content does not create duplicate chunks.
- Cross-tenant policy/chunk access is rejected.
- Published policy and retrieval config versions are immutable.
- Full migration chain is idempotent and live PostgreSQL verification passes.
- Lint, type-check, tests, Compose validation, and Trellis validation pass.

## Dependencies

- Completed Phase 1 database and version snapshot foundation

## Out of Scope

- Reranking, evidence gate, baseline report, response generation, and external
  vector databases.
