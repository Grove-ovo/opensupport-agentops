# Cloudflare Temporary Deploy Report - 2026-07-06

## Scope

This report covers the temporary Cloudflare Worker preview path for OpenSupport
AgentOps. The deployed Worker is an edge shell and optional proxy harness under
`tools/`, not a product module. It is not the full AgentOps runtime.

The full product still requires the Node/Fastify API, PostgreSQL/pgvector,
Redis, Redis Streams worker, Chatwoot, and an LLM provider on a cloud server or
equivalent self-hosted runtime.

## Deployment

- Command: `npm run deploy:cloudflare:temporary`
- Wrangler version: `4.107.0`
- Worker: `opensupport-agentops-edge`
- Temporary account: `Boundless Path`
- Public URL: `https://opensupport-agentops-edge.boundless-path.workers.dev`
- Current Version ID: `71f7bbc4-95ca-49ce-931d-e2cab018f788`
- Claim URL: redacted. The claim URL grants ownership of the temporary preview
  account and must not be committed to repository artifacts.

## Automated Checks

- `npm run test`: passed.
- `npm run test:cloudflare:temporary`: passed, 6/6 tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:release`: passed.

Notes from the full repository run:

- API tests: 18 passed, 3 skipped by existing integration-test conditions.
- Worker tests: 5 passed, 1 skipped by existing integration-test conditions.
- Edge tests: 6 passed, 0 skipped.
- Web unit tests: 7 passed, 0 skipped.

## Real User Scenario Smoke

Tested against the deployed temporary Worker URL.

The final working deploy command runs Wrangler from
`tools/cloudflare-temporary-worker`. A root-level deploy attempt using
`--config tools/cloudflare-temporary-worker/wrangler.toml` produced a public URL
that returned Cloudflare `1042/1104` errors during smoke testing, so the
committed command avoids that path-resolution pitfall.

### Home Page

- Request: `GET /`
- Result: `200 OK`
- Observed behavior:
  - Static temporary deployment shell rendered.
  - Page stated the API origin is not configured.
  - Page stated this is not the full AgentOps backend.
- Security/cache headers:
  - `cache-control: no-store`
  - `content-security-policy`
  - `referrer-policy: no-referrer`
  - `x-content-type-options: nosniff`
  - `x-frame-options: DENY`

### Readiness JSON

- Request: `GET /__agentops/edge-ready`
- Result: `200 OK`
- Observed body:
  - `status: degraded`
  - `temporary_deployment: true`
  - `backend_origin_configured: false`
  - `native_fastify_api: false`
  - `native_postgres_redis: false`
  - `native_worker_runtime: false`

### API Proxy Fail-Closed

- Request: `GET /api/v1/auth/session`
- Result: `503 Service Unavailable`
- Observed body:
  - `error.code: backend_origin_missing`
- Interpretation: without `AGENTOPS_ORIGIN_URL`, API and health proxy paths
  fail closed instead of pretending the full AgentOps runtime is online.

## Security Notes

- The Worker strips untrusted source and forwarding headers before proxying:
  `Forwarded`, `CF-Connecting-IP`, `True-Client-IP`, `X-Client-IP`,
  `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`,
  `X-Forwarded-User`, and `X-Real-IP`.
- The Worker rebuilds `X-Forwarded-Proto` from the request URL protocol and
  tags proxied requests with `X-AgentOps-Edge-Proxy: cloudflare-temporary`.
- Proxied responses are forced to `cache-control: no-store` and receive the
  same security headers as the local shell/readiness responses.
- `/worker/metrics` is an exact proxy route. `/worker/metrics-*` paths do not
  expand the proxy surface.

## Limitations

- This deployment does not run the Dashboard build from `apps/web/dist`.
- This deployment is not an `apps/*` workspace package or production module.
- This deployment does not run the Fastify API in Cloudflare Workers.
- This deployment does not provide PostgreSQL/pgvector, Redis, Redis Streams,
  Chatwoot, or LLM provider integration.
- Live end-to-end AgentOps behavior requires a full origin deployment and
  `AGENTOPS_ORIGIN_URL` configured on the Worker.

## Result

Temporary Cloudflare preview is proven for the isolated shell/proxy harness.
Full-product deployment remains the existing production Compose path on a cloud
server until a separate Cloudflare-native architecture is designed and
implemented.
