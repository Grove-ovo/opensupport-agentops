# Phase 2C Policy Retrieval

## Scenario: Immutable Tenant Policy Corpus And Candidate Retrieval

### 1. Scope / Trigger

- Trigger: changes to policy versions, document ingestion, chunks, embeddings,
  retrieval config versions, PostgreSQL FTS, or pgvector candidate retrieval.
- Applies to migration `0005`, `packages/shared/src/retrieval.ts`,
  `packages/retrieval`, and `docs/policy_retrieval.md`.
- Does not authorize candidate fusion, reranking, evidence gates, response
  generation, or external vector databases.

### 2. Signatures

```ts
createPolicyIngestionPlan(
  input: CreatePolicyIngestionPlanInput,
): PolicyIngestionPlan

retrieveLexicalCandidates(
  input: LexicalCandidateInput,
): RetrievalCandidate[]

retrieveVectorCandidates(
  input: VectorCandidateInput,
): RetrievalCandidate[]
```

```sql
search_policy_chunks_lexical(
  target_tenant_id uuid,
  target_policy_version_id uuid,
  query_text text,
  candidate_limit integer
)

search_policy_chunks_vector(
  target_tenant_id uuid,
  target_policy_version_id uuid,
  target_embedding_model text,
  query_embedding vector(1536),
  candidate_limit integer
)
```

```text
npm run db:migrate
npm run db:verify:retrieval
npm run test:phase2c
npm run test:retrieval
```

### 3. Contracts

- Every policy, document, chunk, embedding, and retrieval config is tenant
  scoped.
- Composite foreign keys keep document, chunk, and embedding policy versions
  consistent within a tenant.
- A policy version is mutable only while draft. Published content is immutable;
  a published version may only transition to archived.
- Retrieval config fields are immutable. Only `is_active` may change, and one
  active version is allowed per tenant.
- Embeddings use exactly 1536 dimensions in Phase 2.
- Ingestion normalizes content before hashing and emits deterministic UUIDv8
  document and chunk identifiers.
- The aggregate policy hash includes source key, title, media type, normalized
  content hash, and canonical metadata.
- PostgreSQL and TypeScript retrieval require explicit tenant and policy
  version scope and return chunk content plus a stable content hash.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Invalid tenant or policy UUID | `RetrievalValidationError: invalid_uuid` |
| Empty or conflicting source document | `invalid_document` or `duplicate_source` |
| Invalid chunk size or overlap | `invalid_chunking` |
| Query embedding is not 1536 finite numbers | `invalid_embedding` |
| Cross-tenant or cross-policy write reference | PostgreSQL `foreign_key_violation` |
| Published policy/content mutation | PostgreSQL `check_violation` |
| Retrieval config field mutation | PostgreSQL `check_violation` |
| Second published policy or active config | PostgreSQL `unique_violation` |
| Extension creation without database admin rights | PostgreSQL `insufficient_privilege` |

> **Warning**: Content immutability triggers must only reject mutations when the
> referenced policy row exists and is not draft. A missing tenant-policy pair
> must pass through to the composite foreign key so callers receive
> `foreign_key_violation`, not a misleading immutability error.

### 5. Good/Base/Bad Cases

- Good: normalize and hash policy sources, persist the deterministic plan under
  a draft version, add 1536-dimensional embeddings, then publish once.
- Good: query through the tenant-scoped SQL functions or TypeScript candidate
  functions using the trace snapshot's policy version.
- Base: identical re-ingestion emits the same document IDs, chunk IDs, hashes,
  offsets, and ordering, so persistence does not add duplicates.
- Bad: update documents after publication or attach a chunk to a document from
  another policy version.
- Bad: accept arbitrary vector dimensions or query candidates without tenant
  and policy version scope.

### 6. Tests Required

- Unit tests assert deterministic output across input order and normalized line
  endings.
- Unit tests assert canonical nested metadata hashing, identical-source
  dedupe, conflicting-source rejection, tenant filtering, lexical ordering,
  vector ordering, and 1536-dimension validation.
- Static validation asserts the pgvector image, migration tables, SQL retrieval
  functions, shared types, package exports, scripts, docs, and spec.
- Apply migrations `0001` through `0005` twice on an empty PostgreSQL 16
  database with pgvector enabled.
- Live verification asserts FTS, vector dimensions, SQL candidate functions,
  cross-tenant isolation, published-content immutability, config immutability,
  and one-active constraints.
- Run `npm run lint`, `npm run typecheck`, `npm test`, Compose config, and the
  active Trellis task validation.

### 7. Wrong vs Correct

#### Wrong

```sql
IF target_status IS DISTINCT FROM 'draft' THEN
  RAISE EXCEPTION 'published policy content is immutable';
END IF;
```

This treats a missing cross-tenant policy row as an immutability failure and
masks the composite foreign key's ownership error.

#### Correct

```sql
IF target_status IS NOT NULL AND target_status <> 'draft' THEN
  RAISE EXCEPTION 'published policy content is immutable'
    USING ERRCODE = 'check_violation';
END IF;
```

Existing published rows remain immutable, while missing or cross-tenant rows
continue to the foreign key and fail with the correct error class.
