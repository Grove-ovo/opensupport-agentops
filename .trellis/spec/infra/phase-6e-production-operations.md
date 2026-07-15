# Phase 6E Production Operations

## 1. Scope / Trigger

Use this contract for production images, Compose topology, reverse-proxy
routing, service observability, deployment secrets, smoke tests, backups, or
operational recovery changes.

## 2. Signatures

- Public endpoint: Nginx on `${AGENTOPS_PUBLIC_PORT:-8088}`
- API probes: `GET /health/live`, `GET /health/ready`, `GET /metrics`
- Worker probes: `GET /worker/health/live`, `GET /worker/health/ready`,
  `GET /worker/metrics`
- Deployment file: `infra/docker/compose.production.yml`
- Self-hosted platform file: `infra/docker/compose.self-hosted-platform.yml`
- Single-host public-port override: `infra/docker/compose.caddy-loopback.yml`
- Platform credential command: `sh scripts/ops/prepare-self-hosted-platform.sh`
- Database backup command: `ENV_FILE=.env.production sh scripts/ops/backup.sh`
- Secret files: `AGENTOPS_MASTER_KEY_FILE`,
  `GRAFANA_ADMIN_PASSWORD_FILE`

## 3. Contracts

API, worker, and web use separately built multi-stage images. PostgreSQL is the
authoritative persistent store; Redis coordinates online dedupe and async
jobs. The migration service must complete before API and worker start.
Credentials remain outside images and source control. Only Nginx is publicly
exposed by default.

API and Worker build/runtime stages use the reviewed `node:22-alpine` base and
create `agentops` with explicit UID/GID `999:999`; changing the base family or
numeric identity requires rebuilding all production images, running the full
Compose smoke, and collecting fresh HIGH/CRITICAL Trivy evidence. The API's
`@fastify/secure-session` dependency loads `sodium-native`, whose package may
ship a glibc Linux prebuild without a musl alias. The Alpine API image therefore
installs `gcompat` and creates the architecture-specific musl alias only when
the package has no native musl prebuild. Do not remove that compatibility path
without proving OIDC session startup on every release architecture.

The supported single-host identity and customer-support topology runs pinned
Keycloak and Chatwoot images in a separate Compose project. Keycloak owns a
dedicated PostgreSQL database; Chatwoot owns dedicated PostgreSQL, Redis, and
storage volumes, with separate Rails and Sidekiq services. Caddy is the only
public ingress and maps the three HTTPS origins to loopback upstreams:

- `agentops.grove.engineer` -> `127.0.0.1:8088`
- `auth.grove.engineer` -> `127.0.0.1:8090`
- `chatwoot.grove.engineer` -> `127.0.0.1:4000`

Chatwoot 4.15 defaults webhook delivery to 5 seconds. The platform Compose
base environment must set
`WEBHOOK_TIMEOUT=${CHATWOOT_WEBHOOK_TIMEOUT:-60}` for Chatwoot Web, Sidekiq,
and migrations. Keep it above the longest AgentOps tenant provider timeout
plus network overhead; otherwise Chatwoot can abandon a valid synchronous
Agent Bot request before AgentOps finishes. This non-secret setting must be
explicit and must not be implemented by sharing an `env_file` containing
platform credentials across services.

Every AgentOps Compose operation on that host must include
`compose.caddy-loopback.yml`; database, Redis, Prometheus, Grafana, Keycloak,
and Chatwoot upstream ports must never bind a public interface. The Keycloak
realm must register the exact AgentOps callback and emit `agentops_roles` and
`agentops_tenants`. The preparation command generates root-readable platform
credentials and synchronizes the Keycloak client secret with the AgentOps
OIDC client-secret file without printing either value.

Production backup coverage includes the AgentOps, Keycloak, and Chatwoot
PostgreSQL databases plus the Chatwoot storage volume. `backup.sh` must set
`umask 077` in the same container shell that creates the dump so the mounted
host file is mode `0600`; a host-side umask does not control a file created by
`pg_dump` inside the container.

For local Docker Compose file-backed secrets, host file ownership matters.
Compose does not reliably remap `uid`, `gid`, or `mode` for non-Swarm local
secret files. Before starting API/Grafana containers, run
`ENV_FILE=.env.production sh scripts/ops/prepare-compose-secrets.sh` after
preflight. API secret files must be owned by `999:999` with no group/other
permission; the Grafana admin password file must be owned by `472:472` with no
group/other permission. Do not weaken host secret modes to world-readable to
make containers start.

The Compose network topology separates concerns:

- `backend` is internal and carries database, Redis, API, worker, and metrics
  traffic.
- `outbound` gives only API and worker access to provider and Chatwoot origins.
- `management` supports localhost-bound PostgreSQL, Redis, Prometheus, and
  Grafana administration.
- `frontend` carries public Nginx traffic.

Structured JSON logs include service and build metadata plus applicable
`request_id`, `canonical_event_id`, `trace_id`, `provider_call_id`,
`delivery_id`, `execution_id`, `outbox_id`, and `stream_id` fields.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Migration service fails | API and worker remain unavailable |
| PostgreSQL or Redis is unavailable | Readiness returns non-2xx |
| Secret file is unreadable | API configuration fails before binding |
| Secret file is host-owned by root/runner and mode `0600` | Run the secret ownership preparation script before Compose startup |
| TypeScript build info exists without `dist` | Docker build uses `tsc -b --force` |
| Alpine API cannot resolve the sodium native addon | Preserve the conditional musl alias plus `gcompat`, then prove authenticated production smoke |
| Provider or Chatwoot call fails | Persist correlated failure and downgrade/handoff |
| Worker retries are exhausted | Move identifier-only work to the dead-letter stream |
| Previous image is required | Roll back immutable image tags; do not reverse migrations |
| OIDC or Chatwoot DNS is absent | Caddy certificate issuance and dependent readiness fail closed; publish DNS, then retry TLS |
| Chatwoot webhook timeout is shorter than AgentOps provider timeout plus overhead | Recreate Chatwoot services with a larger `CHATWOOT_WEBHOOK_TIMEOUT` before live E2E |
| AgentOps port override is omitted on a Caddy host | Deployment validation fails because the web port may bind publicly |
| A database dump is created without container-side `umask 077` | Backup permission test fails; do not retain a group/world-readable dump |

## 5. Good / Base / Bad Cases

- Good: one public endpoint serves the dashboard and proxies API/worker health,
  while Prometheus scrapes internal service metrics.
- Good: replace a vulnerable runtime base with the reviewed Alpine digest,
  preserve required native-addon compatibility, and prove both arm64 and CI
  amd64 startup before removing expired CVE exceptions.
- Base: a production smoke creates an isolated tenant, executes one signed
  Chatwoot event, verifies delivery and dashboard visibility, then archives it.
- Base: CI/server preflight validates secret files first, then the ownership
  preparation script changes owner/mode for non-root containers before Compose
  startup.
- Bad: never bake `.env.production`, provider keys, database passwords, or
  envelope keys into an image or commit.
- Bad: never make secret files `0644`/world-readable as a workaround for
  non-root container access.
- Bad: never attach API or worker only to an `internal: true` Docker network;
  real provider and Chatwoot calls require explicit outbound connectivity.
- Bad: never bypass OIDC discovery readiness with an `/etc/hosts` workaround;
  authoritative DNS and public TLS must succeed before AgentOps starts.
- Bad: never rely on the host shell's umask for a dump created inside a
  container.
- Bad: never keep Chatwoot's 5-second webhook default while a tenant provider
  is allowed 30 seconds, and never solve this by attaching a shared secret
  `env_file` to every Chatwoot service.
- Bad: never renew an expired base-image CVE exception before rebuilding and
  scanning a current alternative base; the old exception list can miss newly
  disclosed CRITICAL findings.

> **Warning**: Production migrations are forward-only. Application rollback
> must target a version compatible with the already-applied schema.

## 6. Tests Required

- Run `docker compose ... config` and build all three application images.
- Scan all three final images with current Trivy data and fail on every
  unresolved CRITICAL finding; do not reuse evidence from a previous base
  digest.
- Assert API and Worker run as UID/GID `999:999`, and load the API sodium
  native addon before treating an Alpine migration as complete.
- Run `sh -n scripts/ops/prepare-compose-secrets.sh` and assert CI invokes it
  before production Compose startup.
- Start the full production Compose stack and verify every long-running service
  is healthy plus the migration service exits successfully.
- Run `npm run smoke:production`, inspect Prometheus targets and Grafana
  provisioning, and verify correlated API/worker logs.
- Run backup and restore dry-runs, `npm test`, browser tests, integration tests,
  dependency audit, and active Trellis task validation.
- Validate the platform Compose file with `.env.platform`, verify Keycloak
  realm JSON parses, and assert all non-public services are internal or
  loopback-bound.
- Assert the rendered Chatwoot Web, Sidekiq, and migration environments contain
  `WEBHOOK_TIMEOUT=60` by default and honor a
  `CHATWOOT_WEBHOOK_TIMEOUT=<seconds>` override without a shared `env_file`.
- Resolve all three public names against the authoritative DNS servers, verify
  TLS, Keycloak discovery, Chatwoot API access, and the AgentOps OIDC redirect.
- Execute a real backup and assert its host mode is `0600`; validate PostgreSQL
  custom-format dumps with `pg_restore -l`.

## 7. Wrong vs Correct

### Wrong

```yaml
environment:
  AGENTOPS_MASTER_KEY: plaintext-key-in-compose
```

### Correct

```yaml
secrets:
  agentops_master_key:
    file: ${AGENTOPS_MASTER_KEY_FILE}
```

### Wrong

```sh
chmod 0644 secrets/agentops_master_key
docker compose --env-file .env.production -f infra/docker/compose.production.yml up -d api
```

### Correct

```sh
AGENTOPS_ENV_FILE=.env.production npm run deploy:preflight
ENV_FILE=.env.production sh scripts/ops/prepare-compose-secrets.sh
docker compose --env-file .env.production -f infra/docker/compose.production.yml up -d api
```

### Wrong

```dockerfile
RUN npm ci && npm run build
```

This can reuse copied `*.tsbuildinfo` while `.dockerignore` omits `dist`.

### Correct

```dockerfile
RUN npm ci && npm run build -- --force
```

### Wrong

```dockerfile
FROM node:22-alpine
# sodium-native has no linux-*-musl prebuild in the installed package.
```

### Correct

```dockerfile
RUN apk add --no-cache gcompat
# In the build stage, add linux-${arch}-musl only when it is absent.
```

The compatibility alias is architecture-specific and must be followed by an
actual `sodium-native` load probe; a successful image build alone is not proof.

### Wrong

```sh
docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml up -d
```

On a Caddy host this can publish port 8088 on every interface.

### Correct

```sh
docker compose --env-file .env.production \
  -f infra/docker/compose.production.yml \
  -f infra/docker/compose.caddy-loopback.yml up -d
```

### Wrong

```yaml
services:
  chatwoot-web:
    env_file: .env.platform
```

### Correct

```yaml
x-chatwoot-base: &chatwoot-base
  environment:
    WEBHOOK_TIMEOUT: ${CHATWOOT_WEBHOOK_TIMEOUT:-60}
```

### Wrong

```sh
pg_dump -Fc -f /backups/agentops.dump
```

### Correct

```sh
umask 077
pg_dump -Fc -f /backups/agentops.dump
```
