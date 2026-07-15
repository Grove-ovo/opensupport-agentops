# Production E2E And Load Test Summary

- Run ID: `20260714T113621Z`
- Production host: `159.223.183.148`
- Public origins: `agentops.grove.engineer`, `auth.grove.engineer`, `chatwoot.grove.engineer`
- Provider: `opencode`
- Model: `deepseek-v4-flash-free`
- Technical gate: **ready**
- Launch decision: **ready for controlled launch after the exposed provider key is rotated**

## Real E2E

The real customer-side Chatwoot API created incoming message `5`. Chatwoot
delivered the `message_created` Agent Bot webhook, AgentOps persisted a
`pipeline_seeded` canonical event, executed the order tool once, completed two
provider calls, and delivered private Shadow note `6`.

| Check | Result |
|---|---|
| Canonical processing | `completed` |
| Runtime state/outcome | `private_noted` |
| Route / intent | `order` / `order_status` |
| Order fixture | `E2E-100`, `shipped`, `in_transit` |
| Provider calls | 2 succeeded, 0 failed |
| Provider latency | 6049 ms and 5503 ms |
| Trace latency | 11570 ms |
| Trace tokens | 532 input / 489 output |
| Estimated cost | USD 0.000000 |
| Delivery | private note, succeeded, one attempt |

## Provider Load

The bounded direct provider profile completed `3@c1`, `6@c2`, and `12@c4`.

| Requests | Success | Errors | Timeouts | p50 | p95 | p99 | Throughput |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 21 | 21 | 0 | 0 | 1112.947 ms | 1421.172 ms | 1581.354 ms | 1.9546 req/s |

All 21 responses reported usage: 1890 prompt, 611 completion, 569 reasoning,
and 2501 total tokens.

## Application Ingress Load

Signed events traversed public Caddy, Nginx, HMAC validation, AgentOps
canonicalization, and PostgreSQL. The events were deliberately non-customer
messages, so they ended as `audit_only` without invoking the LLM or creating
Chatwoot replies.

| Phase | Requests | Success | Expected 429 | Errors | Timeouts | p95 | Throughput |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sustained (`c3`, 150 ms pacing) | 30 | 30 | 0 | 0 | 0 | 140.792 ms | 15.996 req/s |
| Burst (`c25`) | 100 | 75 | 25 | 0 | 0 | 304.143 ms | 166.354 req/s |

The recovery request succeeded after two seconds with HTTP `202` in 13.862
ms. PostgreSQL contained exactly 106 events: 30 sustained successes, 75 burst
successes, and one recovery success. Rate-limited requests were not persisted.

## Operations

- Final deploy preflight: `44 ready / 0 warning / 0 blocked`.
- Prometheus targets: API `up=1`, Worker `up=1`.
- All core containers remained running; health-checked containers were healthy.
- Restart count was zero for all 13 checked core containers.
- Host used memory decreased from 2,773,786,624 to 2,740,236,288 bytes.
- Swap remained unchanged at 536,576 bytes used.
- API and Worker test-window logs had zero error/fatal/exception/timeout keyword matches.
- Final external HTTPS checks returned HTTP `200` for AgentOps, Chatwoot, and Keycloak.
- Credential scan checked the evidence against 15 production secret sources and found no shaped or exact credentials.

## Launch Conditions

1. Rotate the OpenCode API key before customer traffic because the current key
   appeared in chat. Update only the mode-`0600` server secret file and the
   encrypted tenant model config, then rerun one provider probe and one E2E.
2. Treat these results as a controlled single-origin production gate, not a
   multi-region or provider-wide capacity guarantee.
3. Keep `WEBHOOK_TIMEOUT=60` while the AgentOps provider timeout is 30 seconds.
4. Preserve the server evidence at
   `/opt/opensupport-agentops/reports/production-e2e/20260714T113621Z`.

## Evidence Index

- `agentops-e2e.json`: canonical event, trace, provider usage, tool count, runtime audit, and delivery.
- `chatwoot-e2e.json`: incoming/private message metadata and content hashes.
- `provider-load.json` / `provider-load.md`: direct provider request-level and aggregate results.
- `application-ingress-load.json` / `application-ingress-load.md`: sustained, burst, and recovery results.
- `application-ingress-database.json`: persisted ingress counts.
- `final-preflight.json` / `final-preflight.md`: final production readiness checks.
- `secret-scan.json`: credential scan result.
- `baseline-*`, `pre-application-*`, and `post-load-*`: host, container, database, Redis, and Prometheus evidence.
- `api.log` and `worker.log`: raw test-window service logs.
