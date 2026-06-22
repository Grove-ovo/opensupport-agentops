# Phase 6E: Production Deployment, Observability, And Operations

## Goal

Package and verify the complete application as an operable production-style
deployment with images, routing, health probes, metrics, logs, backups, secret
guidance, and rollback procedures.

## Requirements

- Add multi-stage Dockerfiles for API, web assets, and worker.
- Add production Compose for API, worker, web/reverse proxy, PostgreSQL with
  pgvector, Redis, Prometheus, and Grafana provisioning.
- Keep credentials outside images and provide secret-file/environment guidance.
- Route dashboard and `/api` traffic through one public endpoint.
- Add structured JSON logs, request IDs, service/build metadata, and
  Prometheus-compatible service and worker metrics.
- Add resource limits, restart policies, health checks, persistent volumes, and
  dependency ordering.
- Add backup, restore, migration, rollout, rollback, incident, and credential
  rotation runbooks.
- Add CI checks for images, Compose validation, tests, and dependency/security
  audit.
- Update README and architecture documentation to remove obsolete
  reference-only limitations.

## Acceptance Criteria

- [x] Production Compose validates and the full stack becomes healthy.
- [x] A local smoke test creates tenant configuration, submits a Chatwoot event,
      observes execution, and inspects it from the dashboard.
- [x] Metrics targets are healthy and dashboard provisioning loads.
- [x] Logs correlate API request, canonical event, trace, provider call, delivery,
      and worker jobs.
- [x] Backup/restore and rollback commands are documented and dry-run verified.
- [x] Final full test, browser, migration, Compose, Trellis, and repository status
      checks pass.

## Verification

Verified on June 22, 2026:

- Production Compose started PostgreSQL, Redis, API, worker, web, Prometheus,
  and Grafana healthy; migration service exited successfully.
- Production smoke completed a signed Chatwoot event, provider call, delivery,
  async monitor/aggregation, trace query, and Dashboard load.
- Prometheus reported API and worker targets `up`; Grafana provisioned the
  AgentOps dashboard.
- Correlated logs included request, canonical event, trace, provider call,
  delivery, execution, outbox, stream, service, and build identifiers.
- Full tests, real PostgreSQL/Redis integration, browser tests, dependency
  audit, image builds, backup/restore dry-runs, and clean migration replay
  passed.

## Out Of Scope

- Kubernetes and cloud-vendor-specific deployment automation.
- Formal compliance certification.
