# Operator Authentication Research

## Compared Approaches

### Reverse-Proxy Basic Authentication

- Smallest setup, but only protects the whole site with one shared secret.
- Cannot provide durable operator identity or tenant-scoped authorization.
- Shared credentials weaken approval, release, settings, and audit attribution.

### External OAuth2 Proxy

- Standards-based and keeps authentication outside the application.
- Adds another deployable service and still requires trusted-header handling
  plus application-level tenant authorization.
- Useful as a future deployment option, but not the best default for a
  self-contained release bundle.

### Application OIDC With Encrypted Session

- Uses standard OIDC discovery and Authorization Code flow with PKCE.
- Keeps passwords and account lifecycle in the identity provider.
- Gives the application a verified `sub`, roles, and tenant claims for
  authorization and audit.
- Supports Auth0, Keycloak, Azure AD, Google Workspace, and compatible
  providers through configuration.

## Official Plugin Findings

- `@fastify/oauth2` supports OIDC discovery through `discovery.issuer`.
- Discovery populates authorization/token endpoints and selects provider PKCE;
  `S256` can be required explicitly.
- Authorization-code exchange validates the redirect state cookie.
- Passing the reply to token exchange clears the PKCE verifier cookie.
- OAuth state/verifier cookies should be `Secure`, `HttpOnly`, and
  `SameSite=Lax`.
- `@fastify/secure-session` uses libsodium authenticated encryption and
  recommends a pre-generated 32-byte key loaded from a file.
- Secure-session supports multiple keys with newest first for gradual key
  rotation.

## Repository Fit

- Keep `/api/v1/chatwoot/*` on its existing HMAC machine boundary.
- Protect Dashboard HTML and all non-Chatwoot `/api/v1/*` routes with the OIDC
  operator boundary.
- Use OIDC `sub` as the authoritative `actor_id`; reject client-supplied actor
  identity mismatches.
- Configure claim names for roles and tenant IDs. `operator` receives listed
  tenants; `admin` may receive wildcard tenant scope.
- Store only minimal session data: `sub`, display/email hint, roles, tenant
  scopes, issued-at, expires-at, and CSRF token. Do not expose provider tokens
  to the browser.
- Tests use a deterministic local mock OIDC issuer and session keys.

## Decision

Use application-level generic OIDC plus encrypted short-lived sessions. This
is stronger than shared Basic Auth and more self-contained than requiring an
additional OAuth2 proxy, while preserving compatibility with an external
identity platform at deployment time.
