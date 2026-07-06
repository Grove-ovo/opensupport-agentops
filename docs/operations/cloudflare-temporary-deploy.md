# Cloudflare Temporary Deploy

OpenSupport AgentOps is a Node/Fastify, PostgreSQL/pgvector, Redis, Redis
Streams worker, Chatwoot, and LLM-provider system. Cloudflare Workers can host
an edge shell and proxy requests to a running AgentOps origin, but a temporary
Worker deployment does not replace the production Compose runtime.

## What This Target Proves

- `npx wrangler deploy --temporary` can publish a Worker without a permanent
  Cloudflare account setup.
- The public edge URL can serve a readiness shell.
- `/__agentops/edge-ready` exposes a secret-free JSON readiness response.
- When `AGENTOPS_ORIGIN_URL` is configured, `/api/*`, `/health/*`,
  `/worker/health/*`, and `/worker/metrics` can be proxied to a full AgentOps
  deployment.

## What This Target Does Not Prove

- It does not run the Fastify API inside Workers.
- It does not run PostgreSQL, pgvector, Redis, or the async worker.
- It does not validate live Chatwoot or live LLM behavior unless the proxy
  origin points at a real AgentOps deployment.

## Commands

```sh
npm run test:edge
npm run deploy:cloudflare:temporary
```

The temporary deployment uses `apps/edge/wrangler.toml` and
`apps/edge/src/index.mjs`. The deploy command pins `wrangler@4.107.0` through
`npx wrangler@4.107.0 deploy --temporary`.

## Optional API Origin

Set `AGENTOPS_ORIGIN_URL` in the Worker environment when you want the temporary
edge URL to proxy to a running AgentOps deployment. The origin must be the base
URL of the production-style public endpoint, for example:

```text
https://agentops.example.com
```

Without this variable, API and health requests fail closed with
`backend_origin_missing`, and the shell reports `degraded`.

## Proxy Safety

The Worker treats client-supplied source and forwarding headers as untrusted.
Before proxying, it strips `Forwarded`, `CF-Connecting-IP`, `True-Client-IP`,
`X-Client-IP`, `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`,
`X-Forwarded-User`, and `X-Real-IP`, then rebuilds `X-Forwarded-Proto` from
the request URL. Proxied responses also receive explicit `cache-control:
no-store` and the same browser security headers as the shell/readiness
responses.

`/worker/metrics` is matched exactly. `/api/`, `/health/`, and
`/worker/health/` are prefix routes.

## User Scenario

For a Worker-only temporary deploy:

1. Open the temporary Worker URL.
2. Confirm the page says this is a temporary edge deployment.
3. Open `/__agentops/edge-ready`.
4. Confirm `temporary_deployment=true` and `native_postgres_redis=false`.

For a proxied deploy:

1. Configure `AGENTOPS_ORIGIN_URL`.
2. Open the temporary Worker URL.
3. Confirm `/__agentops/edge-ready` reports `status=ready`.
4. Run the normal operator dashboard and Chatwoot smoke tests against the
   proxied origin.

## Latest Evidence

See `reports/cloudflare_temporary_deploy_2026-07-06.md` for the latest
temporary deployment command, public URL, Worker version ID, and real user
scenario smoke results. The report redacts the Cloudflare claim URL because it
grants ownership of the temporary preview account.
