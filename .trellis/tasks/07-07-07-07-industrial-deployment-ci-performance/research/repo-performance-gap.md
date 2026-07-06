# Repository Performance Evidence Gap

## Findings

- `reports/load_test_report.md` is deterministic and reproducible, but it
  explicitly excludes HTTP, network, Chatwoot, provider, container, and
  production capacity measurements.
- `npm run smoke:production` validates one real production-style path through
  the public edge, API, PostgreSQL, Redis, mock provider, mock Chatwoot, and
  dashboard APIs.
- `.github/workflows/ci.yml` already boots the production core stack and
  uploads full-stack evidence, making it the lowest-risk place to add a small
  load gate.
- `scripts/aggregate-gate-lib.mjs` treats CI structure as release evidence, but
  it does not yet assert that the full-stack job captures performance/load
  evidence.

## Recommended MVP

Add a bounded HTTP load script under `scripts/` with no new runtime dependency.
The script should:

- Load `.env.ci.smoke` or an operator-selected env file.
- Check public readiness endpoints before measuring.
- Authenticate through the existing deterministic OIDC mock.
- Seed its own tenant/model/runtime/policy data.
- Send signed Chatwoot webhook requests concurrently with unique message and
  delivery IDs.
- Measure latency, throughput, error rate, p50/p95/p99, and final mock delivery
  count.
- Write secret-safe JSON and Markdown reports.
- Exit non-zero when configured thresholds fail.

## Constraints

- Evidence must not persist cookies, CSRF tokens, provider tokens, webhook
  secrets, database URLs, customer-like free text, or raw provider responses.
- CI thresholds must account for shared GitHub runner variability.
- The report should state that results are local/staging evidence only.

## Useful Existing Code

- `scripts/production-smoke.mjs` contains tenant seed, auth, signed webhook, and
  cleanup patterns.
- `packages/eval/src/load.ts` contains metric semantics worth mirroring:
  warmup exclusion, bounded concurrency, nearest-rank percentiles, and count
  invariants.
- `scripts/aggregate-gate-lib.mjs` is the aggregate release-readiness place to
  require the new CI evidence step.
