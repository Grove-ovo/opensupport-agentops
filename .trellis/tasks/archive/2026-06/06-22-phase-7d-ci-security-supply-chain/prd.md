# Phase 7D: CI Full Stack Security Supply Chain

## Goal

Make CI prove the deployable stack starts and produce auditable software supply
chain security evidence.

## Requirements

- Build immutable API/web/worker image tags.
- Boot the complete production Compose stack with ephemeral generated secrets.
- Run readiness, Prometheus target, Grafana provisioning, and production smoke.
- Scan dependencies and container images for vulnerabilities.
- Generate SPDX or CycloneDX SBOM artifacts for application images.
- Fail on unresolved critical vulnerabilities with documented allowlist rules.
- Upload reports without secrets.

## Acceptance Criteria

- [x] CI validates a running stack, not only Compose syntax.
- [x] Smoke proves ingress, provider adapter, delivery, worker, and Dashboard.
- [x] Image scans and SBOMs are retained as CI artifacts.
- [x] Critical findings fail the release gate unless explicitly time-bounded.

## Out Of Scope

- Publishing images to a production registry.
