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

- [x] Known unsafe examples are blocked with stable reason codes.
- [x] A generated ephemeral valid configuration reports `ready`.
- [x] Reports contain hashes/metadata only, never secret contents.
- [x] Compose startup can be gated on successful preflight.

## Out Of Scope

- Creating real secrets or provider accounts.

## Verification

- `npm run test:phase7c`
- `AGENTOPS_ENV_FILE=.env.production.example npm run deploy:preflight`
  exits non-zero with blocked reason codes.
- Ephemeral valid fixture exercises the CLI and produces `ready` reports.
- Production Compose config validates with an explicit backup bind.
- `npm run typecheck`
- `npm run lint`
- `npm test`
