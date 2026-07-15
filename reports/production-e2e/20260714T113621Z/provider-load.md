# Direct Provider Load Report

- Status: **ready**
- Generated: 2026-07-15T01:18:15.383Z
- Model: deepseek-v4-flash-free
- Stop reason: none

## Aggregate

| Requests | Success | Errors | Timeouts | Error rate | Throughput (req/s) | p50 (ms) | p95 (ms) | p99 (ms) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 21 | 21 | 0 | 0 | 0% | 1.9546 | 1112.947 | 1421.172 | 1581.354 |

## Tokens

- Usage reported: 21/21
- Prompt: 1890
- Completion: 611
- Reasoning: 569
- Total: 2501

## Stages

| Stage | Configured requests | Concurrency | Executed | Error rate | p95 (ms) | Throughput (req/s) |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3 | 1 | 3 | 0% | 1319.248 | 0.8719 |
| 2 | 6 | 2 | 6 | 0% | 1329.835 | 1.6925 |
| 3 | 12 | 4 | 12 | 0% | 1581.354 | 3.1937 |

## Requests

| Request | Stage | Status | Stable error | HTTP | Latency (ms) | Prompt tokens | Completion tokens | Reasoning tokens | Total tokens |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| s1-r1 | 1 | success | - | 200 | 1319.248 | 90 | 21 | 19 | 111 |
| s1-r2 | 1 | success | - | 200 | 1085.12 | 90 | 34 | 32 | 124 |
| s1-r3 | 1 | success | - | 200 | 1035.045 | 90 | 21 | 19 | 111 |
| s2-r2 | 2 | success | - | 200 | 1063.601 | 90 | 22 | 20 | 112 |
| s2-r1 | 2 | success | - | 200 | 1183.438 | 90 | 23 | 21 | 113 |
| s2-r3 | 2 | success | - | 200 | 1060.046 | 90 | 23 | 21 | 113 |
| s2-r4 | 2 | success | - | 200 | 1031.275 | 90 | 23 | 21 | 113 |
| s2-r5 | 2 | success | - | 200 | 1165.943 | 90 | 21 | 19 | 111 |
| s2-r6 | 2 | success | - | 200 | 1329.835 | 90 | 36 | 34 | 126 |
| s3-r2 | 3 | success | - | 200 | 1047.409 | 90 | 22 | 20 | 112 |
| s3-r1 | 3 | success | - | 200 | 1226.203 | 90 | 41 | 39 | 131 |
| s3-r4 | 3 | success | - | 200 | 1228.796 | 90 | 22 | 20 | 112 |
| s3-r3 | 3 | success | - | 200 | 1581.354 | 90 | 78 | 76 | 168 |
| s3-r5 | 3 | success | - | 200 | 1112.947 | 90 | 21 | 19 | 111 |
| s3-r6 | 3 | success | - | 200 | 1068.451 | 90 | 23 | 21 | 113 |
| s3-r7 | 3 | success | - | 200 | 1186.177 | 90 | 21 | 19 | 111 |
| s3-r8 | 3 | success | - | 200 | 1067.03 | 90 | 23 | 21 | 113 |
| s3-r9 | 3 | success | - | 200 | 1103.051 | 90 | 22 | 20 | 112 |
| s3-r11 | 3 | success | - | 200 | 1123.364 | 90 | 22 | 20 | 112 |
| s3-r10 | 3 | success | - | 200 | 1421.172 | 90 | 70 | 68 | 160 |
| s3-r12 | 3 | success | - | 200 | 1107.006 | 90 | 22 | 20 | 112 |

## Interpretation Boundary

This bounded direct-provider probe measures one caller path and does not establish application, regional, or provider-wide capacity.
