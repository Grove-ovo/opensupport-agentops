# Research: Cloudflare Workers temporary deploy readiness

- Query: Official Cloudflare evidence for `npx wrangler deploy --temporary`, Workers Static Assets support, Node/Fastify runtime limits, env/secret handling, and temporary deploy output evidence.
- Scope: mixed
- Date: 2026-07-06

## Findings

### Summary

`npx wrangler deploy --temporary` is an official Cloudflare Wrangler flow for unauthenticated first-time or AI-agent deployments. It requires Wrangler 4.102.0 or later, creates or reuses a temporary preview account, deploys to a `workers.dev` URL, and prints a claim URL. The temporary preview account must be claimed within 60 minutes or Cloudflare deletes it and its deployments.

This is a preview mechanism, not a production or CI/CD mechanism. Cloudflare explicitly says production and CI/CD should use a permanent Cloudflare account with `wrangler login` or a Cloudflare API token, and `--temporary` returns an error if Wrangler can already use OAuth, `CLOUDFLARE_API_TOKEN`, or a global API key.

For this repository, a temporary deploy is plausible for a scoped Cloudflare Worker/static-assets preview, but not for the existing full self-hosted Compose topology as-is. The current app expects Nginx, a long-running Fastify API, PostgreSQL/pgvector, Redis, and a separate Redis Streams worker. Cloudflare temporary accounts support Workers deployments on `workers.dev`, Workers Static Assets, KV commands, one D1 database, Durable Objects commands, up to two Hyperdrive configs, and up to 10 Queues. They do not represent the current Docker Compose topology.

### Files found

- `.trellis/tasks/07-06-cloudflare-temporary-deploy-readiness/task.json` - task metadata; status is `in_progress`.
- `README.md` - declares staging-ready self-hosted production-style stack, including Fastify API, PostgreSQL/Redis, Redis Streams worker, Nginx, Prometheus/Grafana, preflight, CI, and residual risk boundaries.
- `package.json` - relevant scripts include `build:web`, `start:api`, `start:worker`, `deploy:preflight`, and `deploy:up`; no Wrangler script is currently present.
- `apps/api/src/server.ts` - current API entrypoint creates a Fastify app and calls `app.listen(...)`, which is a Node server pattern rather than a Workers `fetch` export.
- `apps/web/package.json` - Dashboard uses Vite with `vite build`; the build output could be candidate static assets for Workers Static Assets if kept within temporary-preview asset limits.
- `docs/architecture.md` - production topology explicitly depends on Nginx, Fastify API, Redis Streams worker, PostgreSQL/pgvector, Redis, Prometheus, and Grafana, with deployment preflight reports.

### Code patterns

- `README.md:24` - project advertises a deployable Fastify API plus real provider adapters, PostgreSQL/Redis persistence, and Chatwoot E2E execution.
- `README.md:30` - production stack includes multi-stage images, Compose, Nginx routing, Prometheus/Grafana, health probes, backup/restore, rollout, rollback, incident, and credential rotation.
- `README.md:38` - repository states the deployment is self-hosted and production-style, not a complete SaaS control plane.
- `package.json:116` - web build command is `npm --workspace @opensupport/web run build`.
- `package.json:118` - API start command runs `node apps/api/dist/server.js`.
- `package.json:125` - deploy preflight is host-side and expects `.env.production`.
- `package.json:126` - approved deploy path is Docker Compose, not Wrangler.
- `apps/api/src/server.ts:4` - runtime config is loaded at process startup.
- `apps/api/src/server.ts:5` - Fastify runtime app is created before listening.
- `apps/api/src/server.ts:31` - API uses `await app.listen({ host, port })`.
- `apps/web/package.json:8` - Vite build emits static frontend assets.
- `docs/architecture.md:560` - production topology serves Dashboard assets through Nginx and proxies API/health.
- `docs/architecture.md:561` - production topology uses Fastify for Chatwoot ingress, provider calls, operations, and metrics.
- `docs/architecture.md:562` - production topology uses a Redis Streams worker.
- `docs/architecture.md:587` - deployment startup is gated by host-side preflight.
- `docs/architecture.md:590` - preflight emits secret-safe JSON and Markdown reports.

### `wrangler deploy --temporary`

Official Cloudflare command reference:

- `wrangler deploy` deploys a Worker to Cloudflare.
- If there is no Wrangler config file, Wrangler can automatically detect a framework and configure the project before deploying.
- `wrangler deploy --temporary` is the documented path for an AI agent or unauthenticated environment before Cloudflare authentication is available.
- It requires Wrangler 4.102.0 or later.
- It creates or reuses a temporary preview account, deploys to that account, and prints a claim URL.
- The command option description says `--temporary` deploys with a temporary preview account only when no Cloudflare credentials are available, and returns an error if OAuth, `CLOUDFLARE_API_TOKEN`, or a global API key is already usable.
- `--temporary` is a deploy-command option, not a global flag.

Official Cloudflare claim-deployments page:

- Use case: AI agent deployment without an existing Cloudflare account and without first authorizing Wrangler.
- `wrangler deploy --temporary` creates/reuses a temporary preview account, deploys the Worker to `workers.dev`, and prints a claim URL.
- Claim within 60 minutes to keep the deployment and resources.
- The Wrangler CLI caches the temporary preview account and reuses it while the account and claim URL remain valid.
- If unclaimed within 60 minutes, Cloudflare deletes the temporary preview account and its deployments.
- Claim URLs grant ownership of the temporary preview account and should be treated as sensitive.

### Evidence returned by a temporary deploy

Cloudflare's example output for `npx wrangler deploy --temporary` includes:

- Terms/privacy notice.
- Temporary account status.
- Account name and whether it was created.
- Claim deadline, shown as 60 minutes.
- Claim URL, for example `https://dash.cloudflare.com/claim-preview?claimToken=<TOKEN>`.
- Upload status for the Worker.
- Deployed triggers status.
- Public `workers.dev` URL, for example `https://example-worker.example-name.workers.dev`.

Cloudflare's public temporary-deploy docs do not show a deployment ID in the sample output. The durable evidence available from official docs is therefore the command transcript containing the temporary account status, claim URL, upload/deployed status, and `workers.dev` URL. The claim URL must be redacted from persistent reports unless the report is treated as secret because it grants ownership of the preview account.

### Assets support

Workers Static Assets can be deployed as part of a Worker. Cloudflare deploys Worker code and static assets in a single operation. In Wrangler config, the `assets.directory` points to the static asset directory, and an `ASSETS` binding can let Worker code fetch assets directly.

`wrangler deploy` supports:

- A `PATH` that may point to an assets directory, equivalent to `--assets`, though the command reference notes this path form currently works only in interactive mode.
- `--assets <directory>`, described as the folder of static assets to be served.
- `--site` is deprecated in favor of Workers Assets.

Routing behavior:

- By default, a URL matching a static asset is served without invoking Worker code.
- If no asset matches and a Worker script exists, the Worker handles the request.
- If no Worker script exists, the result is a `404 Not Found`.
- `not_found_handling = "single-page-application"` can return `index.html` with `200 OK` for SPA routes.
- `run_worker_first` can force Worker execution before asset serving, globally or for selected route patterns.

Limits:

- Temporary preview accounts support Workers Static Assets only up to 1,000 files, with each asset up to 5 MiB.
- Normal Workers platform limits are higher: Static Asset files per Worker version are 20,000 on Free and 100,000 on Paid, with individual Static Asset file size 25 MiB.
- This task did not build or measure `apps/web/dist` because the research agent was restricted to writing only the requested research file. An implementation agent should verify the built asset count and max file size before relying on temporary deploy.

### Node.js and Fastify limitations

Cloudflare Workers is not a normal Node process. Node.js compatibility provides a subset of Node.js APIs and polyfills. To enable built-in Node APIs and polyfills, Cloudflare documents the `nodejs_compat` compatibility flag and a compatibility date of 2024-09-23 or later.

For `node:http`:

- Client-side `http.get` / `http.request` require `enable_nodejs_http_modules` with `nodejs_compat`; this is automatically enabled for compatibility dates on or after 2025-08-15 when `nodejs_compat` is enabled.
- Server-side `http.createServer`, `http.Server`, and `http.ServerResponse` require `enable_nodejs_http_server_modules` with `nodejs_compat`; this is automatically enabled for compatibility dates on or after 2025-09-01 when `nodejs_compat` is enabled.
- Cloudflare provides `httpServerHandler` and `handleAsNodeRequest` from `cloudflare:node` to connect Node HTTP servers to the Workers `fetch` request model.
- In Workers, `server.listen()` ports are routing keys, not actual network ports.
- Connection management differs from Node: `Connection` headers are not used, Workers manage connections automatically, some server options are unsupported, connection-management methods like `closeAllConnections()` and `closeIdleConnections()` are not implemented, trailers/1xx responses have restrictions, and some socket attributes differ.

For Fastify specifically:

- I did not find an official Cloudflare Workers Fastify framework guide in Cloudflare docs. The visible Cloudflare API framework guides list FastAPI and Hono, while web app guides include React/Vite and other frontend frameworks.
- The current `apps/api/src/server.ts` entrypoint calls Fastify `app.listen(...)`. That cannot be treated as a plain long-running Node listener in Workers. A Cloudflare target would need a Worker `fetch` export, or an explicit Cloudflare `node:http` bridge using `httpServerHandler`/`handleAsNodeRequest` plus the required compatibility flags and date.
- A simple static-assets temporary deploy should avoid starting the current Fastify API. A full API preview would need adapter work and separate decisions for PostgreSQL, Redis, background work, metrics, and secret handling.

### Database, Redis, worker, and background topology constraints

Cloudflare temporary preview accounts support only a limited product set. Officially listed supported resources include Workers deployments on `workers.dev`, Workers Static Assets, KV commands that use temporary credentials, one D1 database up to 100 MB, Durable Objects commands that use temporary credentials, up to two Hyperdrive database configurations and 10 connections, and up to 10 Queues.

Cloudflare Workers TCP sockets provide outbound TCP connections via `connect()` from `cloudflare:sockets`; Cloudflare notes many database wire protocols, including PostgreSQL, require an underlying TCP socket API. Cloudflare specifically recommends Hyperdrive for PostgreSQL because it provides `connect()` with connection pooling and query caching.

Implications for this repo:

- The existing PostgreSQL/pgvector and Redis Compose services are not automatically available in a temporary Worker deployment.
- The Redis Streams background worker does not map directly to a single HTTP Worker deploy.
- If the temporary deploy is intended to prove public reachability, the practical first scope is static Dashboard assets plus a minimal Worker health/API shim.
- If the temporary deploy is intended to prove more application behavior, implementation needs a Cloudflare-native runtime design: D1 or Hyperdrive for database access, Queues/Durable Objects if replacing background coordination, and explicit proof that the selected features work within Workers limits.

### Environment variables and secrets

Environment variables:

- Cloudflare treats environment variables as bindings available on the `env` parameter passed to a Worker fetch handler.
- Text strings and JSON values in environment variables are not encrypted and are suited for non-sensitive configuration.
- Wrangler config uses `[vars]` / `vars`.
- `vars` are non-inheritable across Wrangler environments, so each environment must specify its own values.
- Wrangler commands can select an environment with `--env` / `-e`.
- Workers limits list 64 env vars per Worker on Free and 128 on Paid, with 5 KB per variable.

Secrets:

- Cloudflare secrets are encrypted text values for sensitive information such as API keys and auth tokens.
- Secrets are accessed like environment variables through `env`, `cloudflare:workers` global env import, or `process.env` when Node.js compatibility is enabled.
- Secret values are hidden in Wrangler and the dashboard after definition.
- `wrangler secret put` creates a new Worker version and deploys it immediately.
- `wrangler deploy --secrets-file <file>` can upload secrets alongside code, accepting JSON or `.env` format, with up to 100 secrets per bulk request for a single version.
- Secrets not included in `--secrets-file` are preserved from the previous version.
- Required secret names can be declared with the `secrets` configuration property; `wrangler deploy` and `wrangler versions upload` fail if required secrets are missing.
- Local development secrets can use `.dev.vars` or `.env`; Cloudflare warns not to commit `.dev.vars*` or `.env*`.
- Cloudflare warns not to use `vars` for sensitive values.

Temporary-deploy caveat:

- The `wrangler deploy` command reference lists both `--temporary` and `--secrets-file`, but the claim-deployments temporary-account page does not explicitly document `--secrets-file` behavior with `--temporary`. Treat secret upload in a temporary deploy as something that must be tested by implementation, and do not persist real secret values or claim tokens in Trellis reports.

### Readiness implications for the implementation agent

Minimum evidence for a safe temporary deploy trial:

- Use Wrangler 4.102.0 or later.
- Ensure no active Wrangler auth if intentionally testing `--temporary`; otherwise expect `--temporary` to error.
- Build the web assets and verify asset count <= 1,000 and every file <= 5 MiB for temporary preview accounts.
- Use `wrangler deploy --dry-run --outdir <dir>` first if implementation needs to inspect generated bundle output without deploying.
- Do not publish the existing Fastify `app.listen` entrypoint as-is. Provide a Workers-compatible entrypoint.
- Persist only redacted deploy evidence: command, Wrangler version, account created/reused status, claim deadline, redacted claim URL, uploaded/deployed status, and public `workers.dev` URL.
- Treat the claim URL as secret because it grants ownership of the temporary preview account.
- State clearly in docs/reports that this is a temporary public preview, not the repository's production-style self-hosted deployment.

## External references

Official Cloudflare sources only:

- Cloudflare Workers docs: Wrangler `deploy` command - https://developers.cloudflare.com/workers/wrangler/commands/workers/
- Cloudflare Workers docs: Claim deployments (temporary accounts), last updated Jun 19, 2026 - https://developers.cloudflare.com/workers/platform/claim-deployments/
- Cloudflare Workers docs: Static Assets, last updated Jul 3, 2026 - https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Workers docs: Static Assets billing and limitations, last updated Apr 23, 2026 - https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- Cloudflare Workers docs: Platform limits, last updated Jul 5, 2026 - https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers docs: Environment variables, last updated Jun 20, 2026 - https://developers.cloudflare.com/workers/configuration/environment-variables/
- Cloudflare Workers docs: Secrets, last updated Jul 3, 2026 - https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Workers docs: Node.js compatibility, last updated Jul 1, 2026 - https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Cloudflare Workers docs: Node.js `http`, last updated Apr 23, 2026 - https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- Cloudflare Workers docs: TCP sockets, last updated Jun 19, 2026 - https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/

## Related specs

- `.trellis/spec/infra/index.md` - infra pre-development checklist and deployment-related spec index.
- `.trellis/spec/infra/phase-7b-edge-transport.md` - current public edge contract assumes Nginx/Fastify request bounds, source-based rate zones, proxy header rebuilding, and security headers.
- `.trellis/spec/infra/phase-7f-pre-deployment-gate.md` - staging gate must preserve the distinction between "ready for staging deployment" and actually deployed.
- `.trellis/spec/infra/github-release-readiness.md` - release docs must distinguish implemented deterministic capabilities from unimplemented deployment boundaries.

## Research-Time Caveats

- `python3 ./.trellis/scripts/task.py current --source` reported no active task in this spawned context, but the user prompt explicitly supplied `.trellis/tasks/07-06-cloudflare-temporary-deploy-readiness` and the output path.
- At research time, `.trellis/tasks/07-06-cloudflare-temporary-deploy-readiness/prd.md` was not present.
- At research time, no Wrangler config or deploy script was found in the current package scripts.
- I did not build the repository or inspect generated `apps/web/dist`, because the sub-agent was instructed not to modify files outside this research path.
- I did not find an official Cloudflare Workers Fastify framework guide; conclusions about Fastify are based on official Cloudflare Workers Node.js compatibility and `node:http` behavior plus this repo's `app.listen` entrypoint.
- Official Cloudflare temporary-deploy sample output does not show a deployment ID. It shows temporary account status, claim window, claim URL, upload/deployed status, and a `workers.dev` URL.
- Official docs list `--secrets-file` for `wrangler deploy`, but the temporary-account docs do not explicitly confirm `--secrets-file` behavior with `--temporary`; this needs an implementation smoke test if temporary deploys require real secrets.

## Implementation Follow-Up

After the research pass, this task added an isolated Worker preview harness
under `tools/cloudflare-temporary-worker/`, rooted at
`tools/cloudflare-temporary-worker/wrangler.toml`, with the deploy command
`npm run deploy:cloudflare:temporary`.

The implementation intentionally deploys a small Worker shell/proxy instead of
`apps/web/dist` static assets. This is a temporary public reachability and
proxy-wiring proof only. It does not claim the Dashboard, Fastify API,
PostgreSQL/pgvector, Redis, async worker, Chatwoot, or live LLM provider run
natively in Cloudflare Workers.

The harness lives under `tools/` rather than `apps/` so it is not mistaken for
an AgentOps production module. Real deployment remains the cloud server /
self-hosted Compose path.

The deploy command pins `wrangler@4.107.0` via `npx wrangler@4.107.0` to avoid
silent CLI behavior drift during temporary deploy trials.
