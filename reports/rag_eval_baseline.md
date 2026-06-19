# RAG Retrieval Baseline

Date: 2026-06-19
Scope: Phase 2D fixed smoke set

## Configuration

- Retrieval mode: hybrid lexical + vector candidates
- Merge weights: lexical `0.4`, vector `0.6`
- Candidate limits: lexical `20`, vector `20`
- Final top K: `5`
- Evidence threshold: `0.35`
- Rerank: `80%` merged score + `20%` normalized query-token coverage

## Fixed Cases

| Case | Expected Evidence | Top-5 Hit |
|------|-------------------|-----------|
| Return window | `return-30` | Yes |
| Refund eligibility | `refund-unused` | Yes |
| Shipping estimate | `shipping-5-days` | Yes |
| Invoice policy | `invoice-policy` | Yes |
| Damaged item refund | `damaged-refund` | Yes |

## Results

| Metric | Result | Phase 2 Target |
|--------|--------|----------------|
| Retrieval Recall@5 | `100%` | `>= 85%` |
| Evidence Hit Rate | `100%` | `>= 85%` |

This is a deterministic five-case foundation check, not the Phase 4 replay
suite. It validates metric calculation and evidence wiring; it does not claim
production retrieval quality.
