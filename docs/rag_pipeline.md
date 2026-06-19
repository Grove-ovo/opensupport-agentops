# RAG Evidence Pipeline

Status: Phase 2D implemented

## Data Flow

```text
normalized query
  -> optional bounded rewrite
  -> lexical/vector candidate adapters
  -> weighted merge
  -> deterministic query-coverage rerank
  -> retrieval-config threshold
  -> version/injection/conflict gate
  -> EvidenceBundle
```

The pipeline consumes immutable tenant, policy, and retrieval config versions.
It does not read live mutable configuration and does not generate a customer
reply.

## Evidence Bundle

The output preserves:

- normalized and rewritten query;
- raw lexical and vector candidates;
- merged lexical/vector scores;
- deterministic rerank score;
- threshold and document-injection decisions;
- stable evidence IDs and excerpts;
- one blocking or allowing retrieval gate.

Evidence IDs hash tenant, policy version, retrieval config version, chunk ID,
and content hash. The same immutable inputs produce the same citation.

## Evidence Gate

The gate blocks definitive policy claims when:

- no candidate passes the configured threshold;
- a retriever returns a different tenant or policy version;
- a threshold-passing document contains instruction-injection patterns;
- valid evidence contains contradictory policy claims.

Blocked bundles retain raw candidates, merged scores, and any safe evidence
references for trace inspection. Downstream response generation must inspect
`gate.blocking` before making policy claims.

## Query Rewrite Boundary

Query rewriting is optional and injected through an adapter. The rewritten
query must remain non-empty, under the retrieval config character limit, and
no more than three times the normalized input length. Provider payloads and
model reasoning are not part of the evidence contract.
