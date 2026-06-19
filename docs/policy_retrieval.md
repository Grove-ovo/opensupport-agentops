# Policy Corpus And Hybrid Retrieval Foundation

Status: Phase 2C implemented

## Runtime

Local PostgreSQL uses `pgvector/pgvector:pg16`. Existing local containers
created from the earlier PostgreSQL image must be recreated before applying
the Phase 2C migration. The named volume remains compatible with PostgreSQL 16.

```bash
docker compose -f infra/docker/compose.phase1.yml up -d --force-recreate postgres
npm run db:migrate
npm run db:verify:retrieval
```

## Version Model

`policy_versions` owns an immutable tenant policy snapshot:

- A tenant can have multiple numbered versions.
- Only one version can have `published` status.
- Draft content can change before publication.
- Published content, documents, chunks, and embeddings cannot change.
- A published version can only transition to `archived`.

`retrieval_config_versions` stores immutable lexical/vector weights, candidate
limits, score threshold, embedding model, and the fixed 1536 dimensions.
Multiple versions are retained, but a partial unique index permits one active
version per tenant.

## Ingestion

`createPolicyIngestionPlan`:

1. validates tenant and policy UUIDs;
2. normalizes Unicode, line endings, trailing spaces, and blank lines;
3. sorts documents by `source_key`;
4. deduplicates identical sources and rejects conflicting duplicates;
5. creates stable SHA-256 content hashes and deterministic UUIDv8 identifiers;
6. creates bounded overlapping chunks with stable offsets.

The same tenant, policy version, source set, and chunking configuration always
produce the same document IDs, chunk IDs, hashes, and ordering. Persistence can
therefore use the schema uniqueness constraints without duplicating unchanged
content.

## Candidate Retrieval

Phase 2C exposes two independent candidate interfaces:

- lexical candidates use normalized token coverage;
- vector candidates use cosine similarity.

Both require explicit tenant and policy version scope and discard records from
other scopes. Fusion, reranking, evidence thresholds, conflict handling, and
prompt-injection evidence checks belong to Phase 2D.

PostgreSQL storage uses:

- generated `tsvector` plus a GIN index for lexical search;
- `vector(1536)` plus an HNSW cosine index for vector search.

The tenant-scoped SQL interfaces are:

- `search_policy_chunks_lexical(...)`
- `search_policy_chunks_vector(...)`
