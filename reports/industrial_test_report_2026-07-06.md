# Industrial Test Report — 2026-07-06

## Scope

This report covers the bilingual operator dashboard task and the current
repository-wide pre-deployment regression state. The run was performed on
branch `feat/bilingual-operator-ui-complete`.

The test goal was intentionally broader than the UI change:

- Verify the English/Simplified Chinese dashboard switch in unit and browser
  workflows.
- Re-run the deterministic full project quality gate.
- Confirm release-readiness status and record residual risks.
- Identify gaps before attempting production-style deployment or Cloudflare
  temporary deployment.

## Change Under Test

- Added English/Simplified Chinese locale dictionaries for the operator UI.
- Wrapped the dashboard with `LocaleProvider`.
- Added the header language switcher.
- Localized dashboard navigation, shell states, boot/auth states, approvals,
  releases, traces, policy KB, tool/risk, settings, shared state panels, and
  status badges.
- Preserved API payload values and backend enum semantics; localization is
  display-only at the frontend boundary.
- Persisted `agentops-locale` in local storage and synchronized
  `document.documentElement.lang` on initial load and language changes.

## Environment

| Item | Value |
|---|---|
| Date | 2026-07-06 |
| Branch | `feat/bilingual-operator-ui-complete` |
| Node build target | TypeScript project references |
| Browser e2e | Playwright desktop Chrome and Pixel 7 profiles |
| Deployment | Not deployed in this run |
| Production smoke | Not run; requires a running production compose stack |

## Command Evidence

| Gate | Command | Result |
|---|---|---|
| Locale key parity | `node -e "...locale key parity..."` | Passed: `en 322 zh 322` |
| Whitespace/lint | `npm run lint` | Passed |
| TypeScript | `npm run typecheck` | Passed |
| Web unit tests | `npm run test:web` | Passed: 1 file, 7 tests |
| Web production build | `npm run build:web` | Passed |
| Web browser e2e | `npm run test:web:e2e` | Passed with elevated local-listen permission: 10 tests |
| Full repository regression | `npm run test` | Passed with elevated local-listen permission |
| Release readiness | Included in `npm run test`; `npm run test:release` output | Passed, aggregate gate `status=ready` |

### Sandbox Note

The managed sandbox blocks local listeners on `127.0.0.1`, which caused
non-code `EPERM` failures for Playwright preview, Phase 7D mock server tests,
and API OIDC tests. The same commands passed after running with elevated local
listen permission. No code defect was found in those failures.

## Full Regression Coverage

The successful `npm run test` chain covered:

- Phase 1 foundation validators.
- Chatwoot signature verification, canonical event dedupe, outgoing delivery
  idempotency, credential redaction, and retry semantics.
- BYOK model config encryption, key parsing, fingerprinting, and validation.
- LLM observability and cost governance.
- PII masking for English and Chinese examples.
- Trace seed/schema validation.
- Deterministic agent routing, conditional LLM runtime, retrieval, RAG,
  tools, guardrails, agent runtime, runtime modes, approval snapshots/actions,
  release candidates, release gates, eval, security eval, failure buckets,
  benchmark/load/cost reports, phase validators, recovery drill, supply-chain
  checks, API tests, worker tests, web tests, and release readiness.

The API suite reported 18 passing tests and 3 skipped integration tests. The
worker suite reported 5 passing tests and 1 skipped integration test. Skips are
intentional script-controlled integration gates, not failures.

## Browser User Scenarios

Playwright executed each scenario on desktop and mobile:

| Scenario | Evidence |
|---|---|
| Overview dashboard renders and approval confirmation remains usable | Passed |
| Mobile navigation does not overflow the viewport | Passed |
| Language switch changes the dashboard to Simplified Chinese and persists across reload | Passed |
| Signed-out operator reaches the identity provider entry point | Passed |
| Operator without role/tenant scope sees a forbidden state | Passed |

Screenshots are generated in Playwright output folders during e2e execution.

## Release Gate Evidence

`tmp/pre-deployment-gate.json` reported:

```json
{
  "status": "ready",
  "summary": {
    "ready": 8,
    "warning": 0,
    "blocked": 0
  }
}
```

Residual risk remains explicitly documented as staging-only self-hosted
deployment rather than a complete production SaaS control plane.

## Remaining Improvement Areas

| Priority | Area | Recommendation |
|---|---|---|
| P0 | Real deployment evidence | Run production compose boot plus `npm run smoke:production` before claiming deploy-ready runtime behavior. |
| P0 | Cloudflare temporary deployment | Validate whether this Node/Fastify + PostgreSQL/Redis architecture can be adapted to Cloudflare Workers. `wrangler deploy --temporary` cannot deploy the current monorepo directly without an edge-specific entry point and external database bindings. |
| P1 | Live Chatwoot + live LLM scenario | Re-run a real customer conversation against a real Chatwoot instance and a real provider key, then capture trace, approval/reply, cost, and dashboard evidence. |
| P1 | Integration skips | Provide a documented command profile for enabling API and worker integration skips with real PostgreSQL/Redis in CI or staging. |
| P1 | i18n maintenance | Add a small script for locale key parity and include it in CI so future UI changes cannot leave one language incomplete. |
| P2 | Product copy | Review Chinese translations with a native operator/customer-support reviewer before public demo usage. |

## Conclusion

The bilingual dashboard feature is implemented and covered by unit and browser
tests. The deterministic repository test gate and release-readiness gate are
green. The project is suitable for the next stage: production-style local
deployment validation, then a realistic deployment strategy decision for
Cloudflare or another host that can run the API, worker, PostgreSQL, Redis, and
static dashboard together.
