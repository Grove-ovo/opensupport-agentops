# Phase 5 Architecture Benchmark

Generated: 2026-06-20T00:00:00.000Z

> Deterministic reference-fixture architecture comparison. These results do not measure production model, provider, network, Chatwoot, or commerce-system quality.

## Immutable Scope

| Item | Value |
|------|------:|
| Dataset version | phase4-v1 |
| Dataset split | test |
| Evaluated cases | 50 |
| Workload version | benchmark-workload-v1 |
| Config hash | `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |
| Scope hash | `3c04df790f8c3cf67ea9e55b32967875133be071f5b1c7b5a9cf49cc2f053751` |

All four variants executed the same ordered case set, budget fields, edit threshold, configuration hash, and workload version. The shared scope hash excludes variant identity and idempotency keys.

## Metrics

| Variant | Task Success | Retrieval Recall@5 | Tool Accuracy | Unsafe Action | No-evidence Answer | Human Edit | p95 Latency (ms) | Avg Cost/Ticket |
|---------|-------------:|-------------------:|--------------:|--------------:|-------------------:|-----------:|-----------------:|----------------:|
| v0_super_agent | 80.00% | 100.00% | 100.00% | 20.00% | 0.00% | 40.00% | 411 | $0.0265 |
| v1_rag_only | 50.00% | 100.00% | 0.00% | 0.00% | 0.00% | 0.00% | 194 | $0.0109 |
| v2_rag_tools | 80.00% | 100.00% | 100.00% | 20.00% | 0.00% | 40.00% | 293 | $0.0190 |
| v3_selective_pipeline | 98.00% | 100.00% | 100.00% | 0.00% | 0.00% | 0.00% | 425 | $0.0071 |

## V3 Pairwise Deltas

Each delta is `v3_selective_pipeline - baseline`. Lower values are better for unsafe action, no-evidence answer, human edit, latency, and cost. Higher values are better for task success, retrieval recall, and tool accuracy.

| Baseline | Task Success | Retrieval Recall@5 | Tool Accuracy | Unsafe Action | No-evidence Answer | Human Edit | p95 Latency | Avg Cost/Ticket |
|----------|-------------:|-------------------:|--------------:|--------------:|-------------------:|-----------:|------------:|----------------:|
| v0_super_agent | +18.00% | +0.00% | +0.00% | -20.00% | +0.00% | -40.00% | +14 ms | -$0.0194 |
| v1_rag_only | +48.00% | +0.00% | +100.00% | +0.00% | +0.00% | +0.00% | +231 ms | -$0.0038 |
| v2_rag_tools | +18.00% | +0.00% | +0.00% | -20.00% | +0.00% | -40.00% | +132 ms | -$0.0119 |

## Safety-first Ranking

Any variant with a non-zero Unsafe Action Rate ranks below every zero-unsafe variant. Remaining ties are resolved deterministically by task success, tool accuracy, retrieval recall, no-evidence rate, human edit rate, latency, cost, and variant ID.

| Rank | Variant | Unsafe Action | Task Success | Tool Accuracy |
|-----:|---------|--------------:|-------------:|--------------:|
| 1 | v3_selective_pipeline | 0.00% | 98.00% | 100.00% |
| 2 | v1_rag_only | 0.00% | 50.00% | 0.00% |
| 3 | v2_rag_tools | 20.00% | 80.00% | 100.00% |
| 4 | v0_super_agent | 20.00% | 80.00% | 100.00% |

## Interpretation Boundary

- V0-V3 are deterministic project-owned architecture fixtures.
- V3 executes the existing selective Agent pipeline with injected deterministic adapters.
- No live LLM provider, external HTTP request, Chatwoot delivery, approval action, or mutable commerce operation occurs.
- This report supports architecture regression and reproducibility checks; it is not a production capacity or model-quality claim.
