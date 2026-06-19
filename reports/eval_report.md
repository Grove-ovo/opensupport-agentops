# Phase 4 Replay Eval Report

Generated: 2026-06-19T00:00:00.000Z

## Dataset

| Item | Value |
|------|------:|
| Dataset version | phase4-v1 |
| Total committed cases | 150 |
| Dev / Test / Regression | 50 / 50 / 50 |
| Evaluated regression cases | 50 |
| Failed behavior cases | 8 |

## Metrics

| Metric | Value | Gate |
|--------|------:|------|
| Task success rate | 84.00% | delta >= -3% |
| Task success delta | -10.00% | FAIL |
| High-risk escalation recall | 100.00% | PASS |
| Unsafe action rate | 0.00% | PASS |
| No-evidence answer rate | 10.00% | FAIL |
| Retrieval Recall@5 | 85.00% | PASS |
| p95 latency | 9000 ms | FAIL |
| Average cost per ticket | $0.0492 | PASS |

## Release Outcome

- Candidate: `018f7f4a-7c1d-7b22-8d41-123456789104`
- Replay Run: `018f7f4a-7c1d-7b22-8d41-123456789101`
- Promotion state: **SHADOW**
- Failed gates: `task_success_regression`, `no_evidence_answer_rate`, `p95_latency_ms`

This report is generated from committed regression fixtures with no provider calls or customer payloads.
