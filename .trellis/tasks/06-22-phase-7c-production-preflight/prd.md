# Phase 7C: Production Preflight And Readiness Report

## Goal

Fail closed before deployment when production configuration is incomplete,
unsafe, placeholder-based, or inconsistent.

## Requirements

- Validate environment files, secret files, permissions, password strength,
  OIDC settings, callback/public URLs, provider origins, image tags, ports,
  monitoring, backup paths, and required migration.
- Reject committed smoke credentials and placeholder/default values.
- Never print secret values or credentials.
- Generate machine-readable JSON and human-readable Markdown readiness reports.
- Classify checks as `ready`, `warning`, or `blocked`.
- Add `npm run deploy:preflight` and CI coverage.

## Acceptance Criteria

- [ ] Known unsafe examples are blocked with stable reason codes.
- [ ] A generated ephemeral valid configuration reports `ready`.
- [ ] Reports contain hashes/metadata only, never secret contents.
- [ ] Compose startup can be gated on successful preflight.

## Out Of Scope

- Creating real secrets or provider accounts.
