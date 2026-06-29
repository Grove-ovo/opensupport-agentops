# Operator Authentication

OpenSupport AgentOps uses generic OpenID Connect Authorization Code flow with
PKCE S256. The application does not manage operator passwords or retain OIDC
access and refresh tokens.

## Identity Contract

The verified UserInfo response must contain:

- `sub`: stable identity used as the audit actor.
- `agentops_roles` by default: includes `operator` or `admin`.
- `agentops_tenants` by default: tenant UUIDs available to an operator.

Claim and role names are configurable. An `admin` receives explicit wildcard
tenant access. An `operator` without at least one tenant UUID is rejected.

## Session Contract

- `agentops_operator` is an encrypted, `HttpOnly`, `SameSite=Lax` cookie.
- Production requires `Secure=true`.
- Session keys are raw 32-byte files. Configure a comma-separated list with
  the newest key first to rotate keys without invalidating current sessions.
- Session data contains only verified identity, authorization scope, expiry,
  and a session-bound CSRF token.
- Every approval, release, or settings mutation requires `x-csrf-token`.

Generate a session key without printing it to the terminal:

```sh
mkdir -p secrets
openssl rand -out secrets/agentops_operator_session_key 32
chmod 600 secrets/agentops_operator_session_key
```

During rotation, mount both files and configure:

```text
AGENTOPS_OPERATOR_SESSION_KEY_FILES=/run/secrets/session_key_new,/run/secrets/session_key_old
```

## Access Boundaries

- `/api/v1/auth/*`: OIDC login and encrypted session lifecycle.
- `/api/v1/tenants/*`: authenticated and tenant-authorized operators only.
- `/api/v1/chatwoot/*`: existing Chatwoot HMAC machine authentication.
- `/health/*`: orchestration probes.
- `/metrics`: deployment network policy; edge restriction is handled in Phase
  7B.

The Dashboard never submits an audit actor. Approval, release, and settings
services always receive the verified OIDC `sub`.
