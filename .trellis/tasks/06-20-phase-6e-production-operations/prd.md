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

- [ ] Production Compose validates and the full stack becomes healthy.
- [ ] A local smoke test creates tenant configuration, submits a Chatwoot event,
      observes execution, and inspects it from the dashboard.
- [ ] Metrics targets are healthy and dashboard provisioning loads.
- [ ] Logs correlate API request, canonical event, trace, provider call, delivery,
      and worker jobs.
- [ ] Backup/restore and rollback commands are documented and dry-run verified.
- [ ] Final full test, browser, migration, Compose, Trellis, and repository status
      checks pass.

## Out Of Scope

- Kubernetes and cloud-vendor-specific deployment automation.
- Formal compliance certification.

