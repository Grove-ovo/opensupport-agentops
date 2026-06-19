# Technical Design

Phase 2C adds a PostgreSQL-owned policy corpus and a pure TypeScript retrieval
package.

## Storage

- `policy_versions` controls draft, published, and archived lifecycle.
- Documents, chunks, and embeddings use tenant-consistent composite foreign
  keys.
- PostgreSQL generated `tsvector` and GIN provide lexical candidate support.
- pgvector `vector(1536)` and HNSW cosine indexing provide vector candidates.
- Retrieval config rows are immutable versions with one active row per tenant.

## Application Contracts

- Ingestion normalizes and sorts input before deterministic SHA-256 hashing.
- Stable UUIDv8 identifiers make unchanged re-ingestion idempotent.
- Candidate functions require explicit tenant and policy version scope.
- PostgreSQL exposes tenant-scoped lexical and vector candidate functions.
- Phase 2C keeps lexical and vector results separate for Phase 2D fusion.

## Verification

- Unit tests cover deterministic ingestion, duplicate sources, tenant scoping,
  lexical ordering, vector ordering, and invalid embeddings.
- Static validation checks required cross-layer artifacts.
- Live PostgreSQL verification checks pgvector, FTS, dimensions, tenant
  isolation, immutability, and active-version uniqueness.
