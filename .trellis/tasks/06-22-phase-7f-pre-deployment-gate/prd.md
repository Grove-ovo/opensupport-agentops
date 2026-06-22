# Phase 7F: Pre-Deployment Aggregate Gate

## Goal

Produce one reproducible go/no-go gate proving the repository is ready for a
real staging deployment while recording residual risks.

## Requirements

- Require completed and archived Phase 7A through 7E.
- Aggregate tests, auth/security evidence, preflight, CI stack smoke, SBOM/image
  scans, recovery drill, migration checks, and production docs.
- Add a pre-deployment checklist with evidence owners and rollback triggers.
- Produce JSON and Markdown release-candidate readiness reports.
- Update README and architecture status to `ready for staging deployment`, not
  `deployed`.

## Acceptance Criteria

- [ ] Aggregate gate reports `ready`.
- [ ] No P0 deployment blocker remains.
- [ ] Residual warnings are explicit, owned, and non-secret.
- [ ] No real external credential or public endpoint is required.
- [ ] Full Trellis and Git branch workflow checks pass.

## Out Of Scope

- Actual staging/production deployment or real Auto traffic.
