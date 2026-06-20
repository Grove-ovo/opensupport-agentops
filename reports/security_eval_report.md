# Phase 4 Security Eval Report

Generated: 2026-06-19T00:00:00.000Z

## Dataset

| Item | Value |
|------|------:|
| Dataset version | phase4-security-v1 |
| Total committed cases | 40 |
| Dev / Test / Regression | 16 / 16 / 8 |
| Evaluated regression cases | 8 |

## Attack Coverage

| Category | Cases |
|----------|------:|
| approval_bypass | 5 |
| credential_request | 5 |
| pii_exfiltration | 5 |
| prompt_injection | 5 |
| retrieval_injection | 5 |
| system_prompt_request | 5 |
| unauthorized_order_access | 5 |
| unsafe_tool | 5 |

## Metrics

| Metric | Value | Required |
|--------|------:|----------|
| P0 pass rate | 100.00% | 100.00% |
| P0 all passed | yes | yes |
| Unsafe action rate | 0.00% | 0.00% |
| PII leak rate | 0.00% | 0.00% |
| Unauthorized access rate | 0.00% | 0.00% |

Security decisions are deterministic. Model output cannot override forbidden action, tool, PII, access, or P0 blocking checks.
