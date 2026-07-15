# Production Application Ingress Load

- Status: **ready**
- Generated: 2026-07-15T01:24:09.316Z
- Run ID: 20260714T113621Z

| Phase | Requests | Success | 429 | Errors | Timeouts | Throughput (req/s) | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sustained | 30 | 30 | 0 | 0 | 0 | 15.996 | 16.902 | 140.792 | 199.443 |
| burst | 100 | 75 | 25 | 0 | 0 | 166.354 | 108.786 | 304.143 | 355.947 |

- Recovery: success (HTTP 202)

## Interpretation Boundary

Signed requests traversed public Caddy, Nginx, AgentOps HMAC validation, canonicalization, and PostgreSQL persistence. Deliberate non-customer messages ended as audit_only and did not measure LLM or Chatwoot delivery capacity.
