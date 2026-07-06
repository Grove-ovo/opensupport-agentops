# Industrial Deployment CI And Performance Validation

## Goal

Prove the project can run a production-style deployment path under real local
HTTP load, not only deterministic in-process fixtures. The validation must be
safe for CI, secret-safe in its evidence, reproducible by operators, and honest
about its boundary: it validates the self-hosted Compose runtime and mock
provider/Chatwoot path, not public internet capacity or a production SaaS
control plane.

## What I Already Know

- The repository already has deterministic Phase 5 benchmark/load reports.
- The committed Phase 5 load report explicitly excludes HTTP, network,
  Chatwoot, providers, containers, and production capacity claims.
- The Phase 7 CI workflow already boots a production Compose stack, runs
  production preflight, smoke-tests one authenticated Chatwoot/LLM path, checks
  observability, and uploads evidence.
- The aggregate pre-deployment gate checks CI, preflight, recovery drill,
  supply chain evidence, migrations, production docs, and residual risk, but it
  does not yet require a live HTTP performance evidence artifact.
- `scripts/production-smoke.mjs` already contains the safe setup primitives for
  deterministic OIDC auth, tenant/model/runtime seed data, signed Chatwoot
  webhook ingress, dashboard reads, and mock Chatwoot delivery verification.

## Requirements

- Add a production-style HTTP load script that can run against the existing
  Compose stack and deterministic mock services.
- Exercise at least health/readiness, authenticated operator APIs, and signed
  Chatwoot webhook ingress through the public HTTP edge.
- Support warmup, measured iterations, bounded concurrency, request timeouts,
  p50/p95/p99 latency, throughput, status/error accounting, and configurable
  pass/fail thresholds.
- Persist JSON and Markdown evidence under `tmp/` by default, with no secrets,
  tokens, cookies, raw customer text, provider payloads, or secret file
  contents.
- Include the load script in CI full-stack after the authenticated production
  smoke test, and upload its evidence artifacts.
- Teach the aggregate gate to recognize the production HTTP load evidence path
  in CI so staging readiness cannot regress silently.
- Document how to run the load gate locally and how to interpret its limits.

## Acceptance Criteria

- [x] `npm run perf:production` runs against a live production-style stack and
      exits non-zero when thresholds are breached.
- [x] The script emits machine-readable JSON and human-readable Markdown
      evidence with stable metric names.
- [x] The script seeds and cleans up its own demo tenant/runtime records unless
      explicitly told to retain them.
- [x] GitHub CI full-stack executes the load gate and uploads the generated
      evidence.
- [x] Aggregate gate tests fail if CI no longer contains the production load
      evidence step.
- [x] Unit tests cover metrics, threshold classification, report rendering, and
      secret-safe output shape.
- [x] `npm run typecheck`, `npm run lint`, and focused test commands pass.
- [x] A real local run records actual HTTP performance evidence from the current
      machine, with any environment limits called out.

## Definition Of Done

- Implementation is committed in a coherent work commit.
- Trellis check and update-spec flow has been considered.
- CI and local commands are documented.
- Test evidence includes both deterministic unit tests and a real run against
  the local production-style stack when Docker/local listeners are available.

## Technical Approach

Use a first-party Node script rather than adding a new load-test dependency.
The script will reuse the production smoke pattern, then run a bounded worker
pool over signed webhook requests and lightweight authenticated reads. This
keeps the test easy to run in CI, avoids external accounts, and still drives
the real Fastify API, Nginx/web edge, PostgreSQL, Redis coordination, provider
adapter, and Chatwoot delivery mock.

The default CI profile should be intentionally small and stable, for example
warmup 2, measured 20, concurrency 4, p95 threshold 5000 ms, zero allowed
errors. Larger local stress runs can be configured with environment variables
without changing code.

## Decision (ADR-lite)

**Context**: Existing load evidence is deterministic and valuable for
regression, but it cannot support claims about the deployed HTTP path.

**Decision**: Add a production HTTP load gate that runs on the existing
production Compose topology and deterministic mock provider/Chatwoot services.

**Consequences**: The project gains concrete deployment evidence and CI
regression protection. Results are hardware/runner-dependent, so default
thresholds must be conservative and the documentation must avoid public
capacity claims.

## Out Of Scope

- Public internet load testing.
- Live OpenAI/Anthropic billing/provider performance claims.
- Live Chatwoot SaaS account tests.
- Kubernetes, autoscaling, multi-region, or CDN benchmarking.
- Formal SOC2/ISO compliance certification.

## Research References

- [`research/repo-performance-gap.md`](research/repo-performance-gap.md) -
  repository-local gap analysis for HTTP/performance evidence.

## Technical Notes

- Relevant specs read:
  - `.trellis/spec/infra/phase-6e-production-operations.md`
  - `.trellis/spec/infra/phase-7c-production-preflight.md`
  - `.trellis/spec/infra/phase-7d-ci-security-supply-chain.md`
  - `.trellis/spec/infra/phase-7f-pre-deployment-gate.md`
  - `.trellis/spec/agent/phase-5e-application-load-harness.md`
  - `.trellis/spec/agent/phase-5f-reports-integration.md`
- Existing implementation anchors:
  - `.github/workflows/ci.yml`
  - `scripts/production-smoke.mjs`
  - `scripts/production-mock.mjs`
  - `scripts/aggregate-gate-lib.mjs`
  - `scripts/aggregate-gate.test.mjs`
  - `reports/load_test_report.md`
