# Production Server Deployment Validation

## Goal

Deploy OpenSupport AgentOps onto the user-provided server
`168.144.40.49` and validate it like a real industrial staging deployment:
repeatable setup, production Compose, migration health, API/worker/dashboard
readiness, smoke scenario, operational metrics, backup/rollback evidence, and
documented residual gaps.

## Requirements

- Use SSH to deploy to `root@168.144.40.49`.
- Keep secrets out of Git and committed reports.
- Prepare or verify server prerequisites: Docker Engine, Compose v2, git,
  Node/npm only where needed, persistent deployment directory, backup
  directory, and firewall-aware public port.
- Deploy from the committed GitHub repository state, not from untracked local
  files.
- Generate server-local `.env.production` and `secrets/*` with non-placeholder
  values.
- Run deploy preflight before rollout.
- Build and start `infra/docker/compose.production.yml`.
- Verify:
  - migration service exits successfully;
  - API readiness is healthy;
  - worker readiness is healthy;
  - web/Nginx health is healthy;
  - Prometheus and Grafana containers are healthy/reachable locally;
  - production smoke passes and returns trace/dashboard/Chatwoot mock evidence;
  - backup dry-run and restore dry-run commands pass.
- Record concrete metrics: service health, image/container status, smoke trace
  id, latency or command duration, endpoint HTTP status, and known skipped
  integration boundaries.
- If real Chatwoot or real LLM credentials are unavailable, do not pretend the
  environment is production-complete; use the built-in production smoke mock for
  deploy verification and record real-credential gaps explicitly.

## Acceptance Criteria

- [x] SSH connection to `root@168.144.40.49` is verified.
- [x] Server deployment directory is prepared from GitHub.
- [x] Server preflight passes with non-placeholder production config.
- [x] Production Compose stack builds and all required services become healthy.
- [x] `npm run smoke:production` passes against the server stack.
- [x] Backup/restore dry-runs pass or failures are recorded with exact reason.
- [x] A deployment validation report is committed under `reports/`.
- [x] Repository checks still pass locally after report/script changes.
- [ ] Trellis archive and journal commits record the work.

## Out of Scope

- Claiming Amazon-scale production readiness from a single server.
- Committing any server secret, API key, claim token, password, or private key.
- Real payment, billing, public signup, full RBAC, Kubernetes automation, or
  formal compliance certification.
