# Phase 5 Cost Report

Generated: 2026-06-20T00:00:00.000Z

> Deterministic reference-fixture cost comparison. Estimated execution cost is not provider billing and configured tenant budget is not measured spend.

## Budget Configuration

| Item | Value |
|------|------:|
| Currency | USD |
| Configured per-ticket budget | $0.1000 |
| Configured daily budget | $100.0000 |
| Evaluated tickets per variant | 50 |

## Measured Cost And Budget Headroom

| Variant | Tickets | Estimated Avg/Ticket | Estimated Total | Per-ticket Budget | Per-ticket Headroom | Daily Budget | Daily Headroom | V3 Avg Delta | V3 Relative Delta |
|---------|--------:|---------------------:|----------------:|------------------:|--------------------:|-------------:|---------------:|-------------:|------------------:|
| v0_super_agent | 50 | $0.0265 | $1.3250 | $0.1000 | $0.0735 | $100.0000 | $98.6750 | -$0.0194 | -73.21% |
| v1_rag_only | 50 | $0.0109 | $0.5450 | $0.1000 | $0.0891 | $100.0000 | $99.4550 | -$0.0038 | -34.86% |
| v2_rag_tools | 50 | $0.0190 | $0.9500 | $0.1000 | $0.0810 | $100.0000 | $99.0500 | -$0.0119 | -62.63% |
| v3_selective_pipeline | 50 | $0.0071 | $0.3550 | $0.1000 | $0.0929 | $100.0000 | $99.6450 | +$0.0000 | +0.00% |

## Interpretation

- Estimated average and total costs come from normalized benchmark observations.
- Per-ticket and daily budgets are configured limits shown separately from measured estimates.
- Headroom is configured budget minus estimated cost; positive values remain within the reference budget.
- V3 deltas are `v3_selective_pipeline - variant`; negative cost deltas mean V3 is cheaper in this fixture.
- No live provider request or billing API is used.
