# Phase 7A Operator Access

## 1. Scope / Trigger

Use this contract when changing Dashboard/operator authentication, tenant
authorization, audit identity, session cookies, OIDC configuration, or
cookie-authenticated mutations. Chatwoot ingress remains a separate HMAC
machine boundary.

## 2. Signatures

```text
GET  /api/v1/auth/login
GET  /api/v1/auth/callback
GET  /api/v1/auth/session
POST /api/v1/auth/logout
GET|POST|PUT /api/v1/tenants/*
```

```ts
interface OperatorPrincipal {
  subject: string;
  roles: readonly string[];
  tenant_ids: readonly string[];
  admin: boolean;
}

interface OperatorAccess {
  requireSession(request, reply): Promise<void>;
  requireCsrf(request, reply): Promise<void>;
  assertTenant(request, tenantId): OperatorPrincipal;
}
```

## 3. Contracts

- Use OIDC Discovery and Authorization Code flow with PKCE S256.
- Store only verified identity/scope metadata and a CSRF token in the
  encrypted session. Never retain provider access/refresh tokens in browser
  state.
- Load raw 32-byte session keys from files, newest first. Production cookies
  are `Secure`, `HttpOnly`, `SameSite=Lax`, path `/`, and bounded by expiry.
- The configured operator role requires at least one tenant UUID. The admin
  role receives explicit wildcard tenant scope.
- OIDC `sub` is the only audit actor for approvals, releases, and settings.
  Browser `actor_id` input is forbidden.
- Every cookie-authenticated mutation sends the session-bound
  `x-csrf-token`.
- Health probes and Chatwoot routes are not protected by operator session
  middleware. Tenant APIs always are.

Required environment keys:

```text
AGENTOPS_OIDC_ISSUER
AGENTOPS_OIDC_CLIENT_ID
AGENTOPS_OIDC_CLIENT_SECRET or AGENTOPS_OIDC_CLIENT_SECRET_FILE
AGENTOPS_OIDC_CALLBACK_URI
AGENTOPS_OPERATOR_SESSION_KEY_FILES
```

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Missing or expired session | `401 authentication_required` |
| Tenant outside operator claim | `403 forbidden` |
| Missing/invalid CSRF | `403 csrf_invalid` |
| Browser submits `actor_id` | `403 actor_identity_forbidden` |
| Missing operator/admin role or tenant scope | OIDC callback returns `403` |
| State/PKCE verification fails | Callback fails without creating a session |
| Old cookie after key rotation | Accepted only while old key remains in key set |
| Chatwoot request without operator cookie | Continues through HMAC handler |

## 5. Good / Base / Bad Cases

- Good: server maps verified UserInfo claims, stores a minimal encrypted
  session, filters tenant lists at the repository boundary, and derives audit
  actor from `sub`.
- Base: signed-out Dashboard renders a login link without issuing tenant API
  reads.
- Bad: filtering an already-paginated tenant page in the UI or service.
- Bad: accepting `actor_id` from a form, local storage, header, or JSON body.
- Bad: adding an authentication bypass environment flag to production runtime.

## 6. Tests Required

- API: anonymous `401`, cross-tenant `403`, admin wildcard, repository-filtered
  tenant list, forged actor rejection, and CSRF rejection.
- OIDC: deterministic discovery/token/UserInfo provider, state mismatch,
  invalid claims, session expiry, logout, and newest-plus-old key rotation.
- Integration regression: Chatwoot route works without an operator cookie.
- Frontend: session-first loading, CSRF header, no `actor_id`, identity/logout,
  session expiry event, signed-out, and forbidden states.
- Browser: authenticated, signed-out, and forbidden states at desktop and
  mobile widths with no horizontal overflow.
- Run `npm run typecheck`, `npm run lint`, `npm run test:api`,
  `npm run test:web`, and `npm run test:web:e2e`.

## 7. Wrong vs Correct

### Wrong

```ts
await api.approvalAction({ actor_id: 'dashboard-operator', ...command });
const tenants = (await store.listTenants(page)).items
  .filter((tenant) => allowedIds.includes(tenant.id));
```

### Correct

```ts
const actorId = operatorAccess.principal(request).subject;
operatorAccess.assertTenant(request, tenantId);
await store.listTenantsByIds(principal.tenant_ids, page);
```
