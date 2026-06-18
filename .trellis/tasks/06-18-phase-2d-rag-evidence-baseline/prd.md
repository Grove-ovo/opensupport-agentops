# PRD: Phase 2D - RAG Evidence Pipeline + Baseline Eval

## Goal

Turn Phase 2C retrieval candidates into versioned, traceable evidence bundles
and establish the initial retrieval-quality baseline.

## Requirements

- Normalize query, optionally rewrite through a bounded interface, retrieve
  lexical/vector candidates, merge, rerank, threshold, and filter evidence.
- Preserve raw lexical/vector, merged, rerank, and threshold decision fields.
- Detect no-evidence, stale-version, injected-document, and conflicting-policy
  cases.
- Return evidence IDs suitable for trace and response citation.
- Produce `docs/rag_pipeline.md` and `reports/rag_eval_baseline.md`.

## Acceptance Criteria

- Policy claims require valid evidence.
- No-evidence and conflict cases produce blocking retrieval decisions.
- Results are tenant/version consistent and reproducible from retrieval config.
- Baseline report records Recall@5 and Evidence Hit Rate on a small fixed set.
- Lint, type-check, tests, database verification, and Trellis validation pass.

## Dependencies

- Phase 2A
- Phase 2C

## Out of Scope

- Release Gate, 150-case replay suite, benchmark variants, and response delivery.
