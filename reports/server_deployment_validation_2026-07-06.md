# Server Deployment Validation - 2026-07-06

## Summary

OpenSupport AgentOps was deployed and validated on the user-provided cloud
server `168.144.40.49` as a single-node production-style staging environment.
The validation used the committed GitHub state plus server-local environment
and secret files. No secret values were copied into this report.

Cloudflare remains a temporary preview shell/proxy harness only. It is not a
product module and is not the real deployment topology. The real deployment
path is the cloud-server Docker Compose stack running the Node API,
PostgreSQL/pgvector, Redis, the async worker, Dashboard/Nginx, Prometheus, and
Grafana.

Result: **passed for single-node staging validation with mock external
Chatwoot/OIDC/LLM dependencies**.

## Environment

| Item | Value |
|---|---|
| Host | `168.144.40.49` |
| Hostname | `info-collect` |
| OS | Ubuntu 24.04.3 LTS |
| CPU | 1 vCPU |
| Memory | 961 MiB RAM + 4 GiB swap |
| Disk | 24 GiB root volume, 58% used during validation |
| Docker | 29.4.0 |
| Docker Compose | v5.1.1 |
| Deployed commit | `83776f7bd33075c5792a0e13e34deb928d487483` |

## Deployment Adjustments

- Added `infra/docker/compose.single-node.yml` for constrained 1 vCPU staging
  hosts. The base production Compose file has higher resource limits and Docker
  rejects services whose CPU limit exceeds the host CPU count.
- Added `scripts/ops/prepare-compose-secrets.sh` and wired it into GitHub CI.
  Local file-backed Docker Compose secrets keep host ownership/mode semantics;
  API secrets must be readable by the non-root API container UID/GID `999:999`,
  and the Grafana secret must be readable by UID/GID `472:472`.
- Updated the deployment runbook to document the cloud-server primary rollout
  path, single-node override, and secret ownership preparation.

## Preflight

Production preflight passed on the server using server-local configuration and
secret files:

```json
{"status":"ready","summary":{"ready":44,"warning":0,"blocked":0}}
```

After correcting server secret ownership, preflight remained ready.

## Compose Health

All required long-running services became healthy or locally reachable:

| Service | Status |
|---|---|
| PostgreSQL/pgvector | healthy |
| Redis | healthy |
| API | healthy |
| Worker | healthy |
| Web/Nginx | healthy |
| Prometheus | reachable on localhost |
| Grafana | reachable on localhost |

Endpoint probes:

| Endpoint | HTTP |
|---|---|
| `http://127.0.0.1:8088/health/ready` | 200 |
| `http://127.0.0.1:8088/worker/health/ready` | 200 |
| `http://127.0.0.1:8088/` | 200 |
| `http://127.0.0.1:9090/-/ready` | 200 |
| `http://127.0.0.1:3001/api/health` | 200 |

The migration service completed successfully. Migrations `0001` through `0016`
were applied idempotently.

## Production Smoke

The production smoke was run against the server Compose stack using the
deterministic smoke mock for OIDC, provider, and Chatwoot behavior.

```json
{
  "status": "passed",
  "tenant_id": "96e25edd-01e1-4958-87b3-05cce1c84994",
  "trace_id": "9dcec2a8-54ff-44bb-85f5-a54e26f17da2",
  "active_conversations": 1,
  "chatwoot_messages": 1,
  "operator_subject": "smoke-admin",
  "policy_version": 1,
  "demo_data_retained": false
}
```

This proves the deployable stack can accept a signed Chatwoot event, create a
trace, execute the controlled reply path, deliver one Chatwoot message through
the mock endpoint, and expose Dashboard overview data.

## Backup And Restore Dry-Runs

| Check | Result |
|---|---|
| `npm run ops:backup:dry-run` | passed |
| `npm run ops:restore:dry-run` | passed |

The restore script remained fail-safe: without `--confirm`, it prints the
planned `pg_restore` command and refuses to execute a destructive restore.

## Known Boundaries

- Real Chatwoot, real OIDC, and real LLM provider credentials were not used.
  The validation proves the deployable runtime and business loop with mocks,
  not paid external-provider readiness.
- TLS/domain termination is not configured in this validation. Public internet
  exposure still needs a reverse proxy or load balancer with HTTPS.
- This is a single-node staging-style environment. It is not an
  Amazon-scale/Kubernetes/high-availability production claim.
- On very small servers, avoid running full TypeScript builds inside long SSH
  foreground sessions. Build images from CI or run smoke scripts detached when
  collecting deployment evidence.

## Verdict

The project is ready to be treated as a deployable single-node staging demo on
a cloud server. Before a real production launch, add real Chatwoot/OIDC/LLM
credentials, configure HTTPS and domain routing, repeat the smoke with real
external integrations, and run the full CI chain from the pushed GitHub branch.
