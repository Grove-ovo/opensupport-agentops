# Technical Design

Phase 2D adds a pure evidence pipeline around Phase 2C candidate retrieval.

- Retriever and optional rewrite behavior are injected adapters.
- Candidate merging uses immutable retrieval config weights.
- Reranking combines merged score and deterministic query-token coverage.
- Raw candidates and every score/decision remain in `EvidenceBundle`.
- Version mismatch, document injection, no evidence, and conflicting policy
  claims produce blocking evidence gates.
- Stable evidence IDs are derived from immutable tenant/version/chunk inputs.
- The fixed five-case report establishes Recall@5 and Evidence Hit Rate wiring.
