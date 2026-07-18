# Operations Runbook — Entry Point

The single "on-call starts here" page. It answers three questions fast:
**an alert fired — now what? how do I roll back? how do I rotate a key?** —
and links to the detailed procedures. Keep responses here short; put depth in
the linked runbooks.

## First 5 minutes (triage)

```sh
# Service + dependency state
docker compose --env-file .env.production -f infra/docker/compose.production.yml ps

# Readiness probes
curl -fsS http://127.0.0.1:8088/health/ready
curl -fsS http://127.0.0.1:8088/worker/health/ready

# Prometheus targets + recent logs
curl -fsS http://127.0.0.1:9090/api/v1/targets
docker compose --env-file .env.production -f infra/docker/compose.production.yml \
  logs --since 30m api worker web
```

Correlate structured logs by `request_id`, `trace_id`, `canonical_event_id`,
`provider_call_id`, `delivery_id`, `execution_id`, `outbox_id`, `stream_id`.
Full triage/containment detail: [`incident-response.md`](./incident-response.md).

## Alert → action

Alerts are defined in [`../../infra/observability/alerts.yml`](../../infra/observability/alerts.yml).

| Alert | Severity | Likely cause | First action |
|-------|----------|--------------|--------------|
| `AgentOpsTargetDown` | critical | API or worker down ≥2m | Check `docker compose ps` + service logs; if a bad build, **roll back** (below). If a dependency, see `AgentOpsDependencyUnavailable`. |
| `AgentOpsDependencyUnavailable` | critical | Postgres/Redis/provider readiness failed ≥5m | Check the failing dependency's container/logs; restore connectivity before restarting API/worker. Do **not** restore the DB while API/worker run. |
| `AgentOpsWorkerDeadLetters` | critical | Worker produced dead-letter jobs | Inspect dead-letter **error code** and immutable aggregate reference; **never replay raw payloads**. Move affected tenant to Shadow if delivery-related. |
| `AgentOpsHttpErrorRate` | warning | API 5xx > 5% for 10m | Identify the failing route from logs; if provider/Chatwoot-driven, move affected tenant runtime mode to **Shadow**; if release-driven, stop Auto promotion and consider rollback. |

Containment levers (detail in [`incident-response.md`](./incident-response.md)):
move a tenant to **Shadow**, **stop Auto promotion** and archive the release
candidate, or **rotate** an exposed credential.

## How do I roll back?

Summary — full steps in [`deployment-runbook.md#rollback`](./deployment-runbook.md):

1. Stop new ingress at the upstream load balancer / TLS proxy.
2. Capture logs and run a backup (`sh scripts/ops/backup.sh`).
3. Set `AGENTOPS_BUILD_VERSION` to the previous immutable image tag.
4. `docker compose ... up -d api worker web`, then verify readiness + Dashboard.

> Migrations are **forward-only**. If the previous build cannot read the migrated
> schema, stop API/worker and restore the pre-rollout backup via
> [`backup-restore.md`](./backup-restore.md). Never run ad hoc down-migrations.

## How do I rotate a key?

Pick the credential — full steps in [`credential-rotation.md`](./credential-rotation.md):

| Credential | Short procedure |
|------------|-----------------|
| Provider API key | New tenant model-config version with the new key → verify one Shadow run → disable old. |
| Chatwoot secret/token | Add new value to env → point tenant connection at new `env:NAME` → restart API → verify signed ingress + one outbound → revoke old. |
| Postgres / Redis / Grafana | Maintenance window → update `.env.production`/secret file → recreate services → verify readiness + Prometheus targets. |
| Envelope master key | **Never** replace `agentops_master_key` in place — run the re-encryption procedure (new key ID, re-encrypt all tenants, verify, then remove old). |

Operator session key rotation: see [`../operator_authentication.md`](../operator_authentication.md).

## Detailed runbooks

- [`deployment-runbook.md`](./deployment-runbook.md) — deploy, smoke, load, rollback
- [`incident-response.md`](./incident-response.md) — triage, containment, evidence
- [`credential-rotation.md`](./credential-rotation.md) — rotate every credential class
- [`backup-restore.md`](./backup-restore.md) — backup and restore
- [`deploy-preflight.md`](./deploy-preflight.md) — pre-rollout config validation
- [`provider-load-probe.md`](./provider-load-probe.md) — provider capacity probe
- [`self-hosted-platform.md`](./self-hosted-platform.md) — platform topology
- [`cloudflare-temporary-deploy.md`](./cloudflare-temporary-deploy.md) — temporary preview (not the prod path)

## Related

- Current system health & report pointers: [`../../reports/README.md`](../../reports/README.md)
- Known-risk / closed-loop ledger: [`./known-risk-acceptance.md`](./known-risk-acceptance.md)
