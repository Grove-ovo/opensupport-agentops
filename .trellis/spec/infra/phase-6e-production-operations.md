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
- Secret files: `AGENTOPS_MASTER_KEY_FILE`,
  `GRAFANA_ADMIN_PASSWORD_FILE`

## 3. Contracts

API, worker, and web use separately built multi-stage images. PostgreSQL is the
authoritative persistent store; Redis coordinates online dedupe and async
jobs. The migration service must complete before API and worker start.
Credentials remain outside images and source control. Only Nginx is publicly
exposed by default.

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
| TypeScript build info exists without `dist` | Docker build uses `tsc -b --force` |
| Provider or Chatwoot call fails | Persist correlated failure and downgrade/handoff |
| Worker retries are exhausted | Move identifier-only work to the dead-letter stream |
| Previous image is required | Roll back immutable image tags; do not reverse migrations |

## 5. Good / Base / Bad Cases

- Good: one public endpoint serves the dashboard and proxies API/worker health,
  while Prometheus scrapes internal service metrics.
- Base: a production smoke creates an isolated tenant, executes one signed
  Chatwoot event, verifies delivery and dashboard visibility, then archives it.
- Bad: never bake `.env.production`, provider keys, database passwords, or
  envelope keys into an image or commit.
- Bad: never attach API or worker only to an `internal: true` Docker network;
  real provider and Chatwoot calls require explicit outbound connectivity.

> **Warning**: Production migrations are forward-only. Application rollback
> must target a version compatible with the already-applied schema.

## 6. Tests Required

- Run `docker compose ... config` and build all three application images.
- Start the full production Compose stack and verify every long-running service
  is healthy plus the migration service exits successfully.
- Run `npm run smoke:production`, inspect Prometheus targets and Grafana
  provisioning, and verify correlated API/worker logs.
- Run backup and restore dry-runs, `npm test`, browser tests, integration tests,
  dependency audit, and active Trellis task validation.

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

```dockerfile
RUN npm ci && npm run build
```

This can reuse copied `*.tsbuildinfo` while `.dockerignore` omits `dist`.

### Correct

```dockerfile
RUN npm ci && npm run build -- --force
```
