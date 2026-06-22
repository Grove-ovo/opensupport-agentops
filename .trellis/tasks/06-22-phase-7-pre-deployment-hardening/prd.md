# Phase 7: Pre-Deployment Hardening

## Goal

Bring OpenSupport AgentOps from a production-style reference deployment to a
deployable release candidate without connecting real production credentials,
publishing a public endpoint, or enabling live Auto traffic.

## What I Already Know

- Phase 1 through Phase 6 are implemented, checked, archived, and merged.
- The production Compose stack, deterministic smoke, PostgreSQL/Redis
  integrations, Dashboard browser tests, metrics, logs, and runbooks pass.
- Dashboard and tenant operations APIs currently have no operator
  authentication. Anyone who can reach the public port can inspect tenant data,
  mutate model/Chatwoot settings, approve replies, and transition releases.
- Chatwoot inbound routes already use tenant-scoped signature verification and
  must remain callable without operator credentials.
- Nginx adds basic response security headers, but there is no request rate
  limiting or explicit request-body limit at the public edge.
- `.env.production.example` contains placeholder and smoke credentials, but no
  executable preflight rejects them before a deployment.
- CI validates Compose and builds images, but does not boot the production
  stack, run the production smoke, scan images, or generate an SBOM.
- Backup and restore commands are documented and dry-run checked; an automated
  disposable restore drill is not yet present.
- Full SaaS identity, public signup, billing, and complete RBAC remain outside
  the original PRD.

## Requirements (Evolving)

### P0 Deployment Blockers

- Add generic OIDC Discovery with Authorization Code + PKCE for Dashboard and
  operator APIs.
- Store only a short-lived encrypted server session in a `Secure`, `HttpOnly`,
  `SameSite=Lax` cookie using a rotating secret-file key set.
- Use verified OIDC `sub` as the audit actor and configurable OIDC claims for
  operator roles and tenant allowlists. Never trust request-body `actor_id`.
- Keep Chatwoot Agent Bot/account webhook ingress authenticated by HMAC and
  reachable without operator login.
- Add CSRF protection to cookie-authenticated write operations and explicit
  logout/session invalidation.
- Add edge rate limits, request-body limits, connection/timeouts, and complete
  security headers without breaking provider or Chatwoot callbacks.
- Add an executable production preflight that fails closed on placeholder,
  missing, weak, conflicting, or smoke-only production configuration.
- Add a deploy-readiness report that distinguishes `ready`, `warning`, and
  `blocked`, without printing secrets.

### P1 Release Hardening

- Boot the complete production Compose stack in CI with generated ephemeral
  secrets and run readiness plus deterministic production smoke.
- Add container/image vulnerability scanning and an SBOM artifact.
- Add an automated backup-to-disposable-restore verification that checks schema
  version and representative records.
- Verify migration idempotency and application rollback compatibility rules.
- Strengthen container isolation where supported: non-root users, dropped
  capabilities, read-only filesystems/tmpfs, resource/PID limits, health
  checks, and bounded logs.
- Add tests for authentication bypass, cross-tenant access, rate limiting,
  preflight rejection, restore verification, and safe error/log output.

### Documentation And Release Evidence

- Add a pre-deployment checklist with owners, required evidence, go/no-go
  conditions, rollback trigger, and residual risks.
- Document external TLS termination and real-secret injection as deployment
  steps, not work performed in this task.
- Update README, architecture, operations runbooks, CI, and Trellis specs to
  match the hardened executable system.

## Acceptance Criteria (Evolving)

- [x] Unauthenticated users cannot load Dashboard data or call operator
      read/write APIs.
- [x] Chatwoot HMAC ingress continues to work without operator credentials and
      cannot access operator routes.
- [x] Tenant-scoped operator access cannot read or mutate another tenant.
- [x] Edge limits return stable status codes and do not expose secrets or raw
      customer/provider payloads.
- [ ] Production preflight rejects default passwords, smoke credentials,
      missing secret files, invalid provider origins, mutable/local image tags,
      and incomplete monitoring configuration.
- [ ] CI boots the production Compose stack and completes readiness plus
      deterministic end-to-end smoke.
- [ ] CI produces dependency/image scan results and an SBOM with no unresolved
      critical release blocker.
- [ ] A disposable backup/restore drill proves migration version 16 and
      representative tenant/trace/audit records survive restoration.
- [ ] Full tests, type-check, lint, integration, browser, migration, Compose,
      security, and Trellis validation pass.
- [ ] A generated deploy-readiness report is `ready` with only explicitly
      accepted residual warnings.

## Definition Of Done

- Every P0 blocker is fixed and covered by automated tests.
- P1 release-hardening checks are executable locally and in CI.
- No real Chatwoot, provider, domain, TLS, or cloud credentials are required.
- Work is committed on feature branches, checked, archived, merged to `dev`,
  and only promoted to `main` after the aggregate gate passes.

## Decision (ADR-Lite)

**Context**: The system needs an operator access boundary before deployment,
but the original PRD explicitly excludes a complete SaaS identity and RBAC
platform.

**Decision**: Use generic OIDC discovery with Authorization Code and PKCE,
followed by an encrypted short-lived application session. OIDC `sub` is the
audit identity; configurable role and tenant claims drive application-layer
authorization. Retain Chatwoot HMAC as a separate machine-to-machine ingress
boundary.

**Consequences**: The release becomes safe to place behind TLS without
inventing signup, password storage, billing, organization membership, or a
full identity product. Deployers must provide an OIDC issuer/client and claim
mapping. Local and CI tests use a deterministic mock issuer.

## Out Of Scope

- Actual staging or production deployment.
- Real provider, Chatwoot, DNS, TLS, email, or cloud credentials.
- Public signup, password recovery, billing, organization management, or full
  multi-role RBAC.
- Enabling Auto for real customer conversations.
- Kubernetes or cloud-vendor-specific infrastructure.
- Real commerce mutation adapters.

## Implementation Sequence

1. Phase 7A: OIDC operator authentication, encrypted session, tenant
   authorization, CSRF, and Dashboard login/logout UX.
2. Phase 7B: Edge limits and transport hardening.
3. Phase 7C: Production configuration preflight and deploy-readiness report.
4. Phase 7D: CI full-stack smoke, dependency/image scanning, and SBOM.
5. Phase 7E: Disposable backup/restore drill and rollback verification.
6. Phase 7F: Aggregate pre-deployment gate, documentation, and residual-risk
   register.

## Technical Notes

- Primary surfaces: `apps/api`, `apps/web`, `infra/docker`,
  `infra/observability`, `.github/workflows`, `scripts/ops`, and operations
  documentation.
- Existing HMAC, state-machine, immutable snapshot, and tenant-scope contracts
  remain authoritative.
- Research: `research/operator-authentication.md`.
- `.workbuddy/` is unrelated local state and must not be included in this task.
