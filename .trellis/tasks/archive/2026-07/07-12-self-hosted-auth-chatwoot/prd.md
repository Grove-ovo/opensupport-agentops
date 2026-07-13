# Deploy Self-Hosted Identity And Chatwoot Production Stack

## Goal

Deploy production-oriented self-hosted identity and Chatwoot services on
`159.223.183.148`, integrate them with OpenSupport AgentOps, and expose all
public services through HTTPS under `grove.engineer`.

## What I Already Know

- AgentOps is staged at `/opt/opensupport-agentops` on Ubuntu 24.04 with Docker
  Engine 29.1 and Compose 2.40.
- `agentops.grove.engineer` resolves to the server and has a valid automatically
  renewed Let's Encrypt certificate through Caddy.
- The host has about 8 GiB RAM and 153 GiB free disk.
- The application requires generic OIDC Authorization Code + PKCE and custom
  `agentops_roles` / `agentops_tenants` claims.
- Chatwoot requires separate Rails and Sidekiq processes plus PostgreSQL and
  Redis. The existing local-only Compose file is not production-ready.
- Current upstream releases are Chatwoot `v4.15.1` and Keycloak `26.7.0`.

## Requirements

- Pin all application and database image versions.
- Use unique generated credentials stored only in root-readable server files.
- Bind databases, Redis, and application upstream ports to private networks or
  loopback only.
- Expose `auth.grove.engineer`, `chatwoot.grove.engineer`, and
  `agentops.grove.engineer` through Caddy HTTPS.
- Configure a Keycloak realm/client compatible with the AgentOps OIDC contract.
- Run Chatwoot Rails and Sidekiq with persistent database and storage volumes.
- Add health checks, restart policies, resource limits, backup coverage, and an
  explicit rollback procedure.
- Keep existing local `dump.rdb` and historical `infra/chatwoot` data out of the
  deployment.

## Acceptance Criteria

- [x] Public DNS resolves all three service hostnames to `159.223.183.148`.
- [x] TLS verification succeeds for all three hostnames and HTTP redirects to HTTPS.
- [x] Keycloak discovery metadata is reachable and the AgentOps OIDC callback is registered.
- [x] Chatwoot web and Sidekiq services are healthy and its UI is reachable.
- [x] AgentOps production preflight reports `ready` with no warnings or blockers.
- [x] AgentOps API, worker, and public readiness endpoints pass after rollout.
- [x] PostgreSQL, Redis, Prometheus, Grafana, Keycloak, and Chatwoot upstream ports are not public.
- [x] Backup and rollback commands are documented and dry-run successfully.

## Definition Of Done

- Compose configuration validates before rollout.
- Immutable image versions and secret-safe configuration are used.
- Relevant lint, typecheck, infra validation, preflight, and live health checks pass.
- Deployment and rollback instructions match the running server state.

## Decision (ADR-Lite)

**Context:** AgentOps needs a generic OIDC provider and a real Chatwoot instance
on one constrained server.

**Decision:** Use Keycloak 26.7.0 and Chatwoot 4.15.1 as separate Compose stacks,
with Caddy on the host for TLS. Each service owns its state and credentials;
only public web endpoints are routed through Caddy.

**Consequences:** This is reproducible and standards-based, but single-host
failure affects all services. The deployment must reserve memory carefully and
back up three PostgreSQL databases plus Chatwoot storage.

## Rollout Evidence

- On 2026-07-13, all four Name.com authoritative servers and public resolvers
  returned `159.223.183.148` for `agentops`, `auth`, and `chatwoot`.
- Caddy obtained trusted Let's Encrypt certificates for all three origins;
  AgentOps readiness, Keycloak discovery, and Chatwoot returned HTTP 200.
- AgentOps API, worker, and web health checks passed. Keycloak, Chatwoot Rails,
  PostgreSQL, and Redis health checks passed; Chatwoot Sidekiq remained up.
- OIDC browser navigation reached the Keycloak Authorization Code + PKCE login
  page with the exact production callback URI. Chatwoot API authentication
  returned HTTP 200.
- UFW permits only 22, 80, and 443. Every application, database, Redis, and
  observability upstream is internal or bound to `127.0.0.1`; direct public
  HTTP probes to loopback ports returned no response.
- Initial AgentOps, Keycloak, Chatwoot, and Chatwoot-storage backups were
  created and validated. New AgentOps dumps were verified as mode `0600`.
- OpenAI provider origin, initial model pricing, Chatwoot credentials, and the
  initial `admin@grove.engineer` identity are configured in server-only files.

## Follow-Up

- Clerk may replace or proxy the current Keycloak login later. Preserve the
  callback URI and `agentops_roles` / `agentops_tenants` claim contract.
- Move Chatwoot attachments and encrypted off-host backups to Cloudflare R2
  after bucket credentials and retention policy are available.

## Out Of Scope

- Multi-node high availability and managed database migration.
- SMTP delivery until mail credentials are supplied.
- External object storage; Chatwoot initially uses a persistent local volume.

## Technical Notes

- Relevant specs: `.trellis/spec/infra/phase-6e-production-operations.md`,
  `.trellis/spec/infra/phase-7a-operator-access.md`,
  `.trellis/spec/infra/phase-7b-edge-transport.md`, and
  `.trellis/spec/infra/phase-7c-production-preflight.md`.
- Integration contract: `.trellis/spec/integrations/chatwoot-connector.md`.
- Existing deployment compose: `infra/docker/compose.production.yml`.
