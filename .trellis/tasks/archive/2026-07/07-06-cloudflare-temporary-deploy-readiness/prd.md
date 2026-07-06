# Cloudflare Temporary Deploy Readiness

## Goal

Attempt a Cloudflare Workers temporary deployment path for OpenSupport AgentOps
while preserving architectural truth: the full product requires the Node
Fastify API, Redis worker, PostgreSQL/pgvector, Redis, and Chatwoot/LLM
dependencies. A temporary Worker deployment can validate an edge-hosted shell,
static assets, and optional API proxy wiring, but it cannot by itself replace
the production runtime.

## Requirements

- Use official Cloudflare/Wrangler behavior for `npx wrangler deploy --temporary`.
- Add a minimal, isolated Cloudflare Worker entry point if the current monorepo
  has no directly deployable Worker target.
- Do not modify API, worker, database, or Chatwoot runtime semantics just to fit
  Cloudflare Workers.
- The temporary deployment must make its limitations explicit in project docs
  and test reports.
- If an API origin is configured, the edge target should be able to proxy API
  and health requests to that origin.
- If no API origin is configured, the edge target should fail safely with a
  clear readiness response instead of pretending the full AgentOps runtime is
  online.
- Preserve Trellis and Git history for every implementation and documentation
  step.

## Acceptance Criteria

- [x] Research notes document the current Cloudflare temporary deployment
  behavior and constraints.
- [x] Repository contains a documented temporary Worker deploy target.
- [x] The Worker target builds and has automated tests for static shell,
  readiness, and proxy behavior.
- [x] `npx wrangler deploy --temporary` is attempted, with result and URL or
  failure reason recorded.
- [x] A realistic user scenario is executed against the temporary deployment if
  deployment succeeds; otherwise the blocker is documented with exact command
  evidence.
- [x] Existing full repository checks continue to pass after the deploy adapter.

## Evidence

- Worker target: `apps/edge/wrangler.toml` and `apps/edge/src/index.mjs`.
- Deployment docs: `docs/operations/cloudflare-temporary-deploy.md`.
- Deployment report:
  `reports/cloudflare_temporary_deploy_2026-07-06.md`.
- Deployment command: `npm run deploy:cloudflare:temporary`.
- Deployed URL:
  `https://opensupport-agentops-edge.glass-carrot.workers.dev`.
- Current Worker Version ID: `16e4230d-c3dc-44c2-9fd1-6cbf4df61763`.
- Verification commands:
  - `npm run test`
  - `npm run test:edge`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:release`

The Cloudflare claim URL is intentionally omitted from committed evidence
because it grants ownership of the temporary preview account.

## Definition of Done

- Cloudflare temporary deploy path is either successfully deployed and smoke
  tested, or blocked with a precise technical reason backed by command output.
- Documentation tells future operators what the Worker deployment does and does
  not prove.
- Changes are committed on the feature branch and pushed.

## Out of Scope

- Rewriting the Fastify API, Redis worker, PostgreSQL, Redis, Chatwoot, or LLM
  runtime to run natively on Cloudflare Workers.
- Claiming production readiness from a Worker-only temporary URL.
- Moving persistent data to Cloudflare D1/R2/Queues in this task.

## Technical Notes

- Current runtime is Node/Fastify + PostgreSQL/pgvector + Redis + Redis Streams
  worker, deployed through production Compose.
- The dashboard is a Vite static build under `apps/web/dist`.
- A Worker adapter should be isolated under an edge-specific directory and
  should avoid touching core runtime packages unless necessary.
