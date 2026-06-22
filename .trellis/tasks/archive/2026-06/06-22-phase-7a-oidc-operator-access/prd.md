# Phase 7A: OIDC Operator Access Boundary

## Goal

Prevent unauthenticated or cross-tenant access to Dashboard and operator APIs
using generic OIDC with PKCE and encrypted short-lived sessions.

## Requirements

- Add generic OIDC discovery, login, callback, session, identity, CSRF-token,
  and logout routes.
- Require Authorization Code flow with PKCE S256 and validated redirect state.
- Encrypt session cookies using rotating 32-byte keys loaded from secret files.
- Cookie contract: `Secure`, `HttpOnly`, `SameSite=Lax`, bounded expiry.
- Session contains only verified identity/scope metadata; do not expose or
  retain provider access/refresh tokens in browser state.
- Map configurable role and tenant claim names into `OperatorPrincipal`.
- `operator` may access only listed tenant IDs; `admin` may use wildcard scope.
- Protect all tenant list/read/mutation APIs and Dashboard API calls.
- Keep health, metrics policy, auth routes, and Chatwoot HMAC ingress on
  explicitly separate access rules.
- Derive audit actor from verified `sub`; reject mismatched client `actor_id`.
- Require double-submit or session-bound CSRF token on cookie-authenticated
  mutations.
- Add Dashboard signed-out, login, authenticated identity, unauthorized,
  session-expired, and logout states.
- Provide deterministic mock OIDC/session tests without real credentials.

## Acceptance Criteria

- [x] Anonymous operator API requests return `401`.
- [x] Authenticated operators can access only allowed tenants; cross-tenant
      reads and writes return `403`.
- [x] Admin wildcard access is explicit and tested.
- [x] Chatwoot signed ingress remains functional without an operator session.
- [x] Approval/release/settings audit actor is the OIDC subject, not request
      input.
- [x] Missing/invalid CSRF blocks every operator mutation.
- [x] Session expiry, logout, state mismatch, invalid claims, and key rotation
      are tested.
- [x] Dashboard login/logout and forbidden states pass desktop/mobile tests.

## Out Of Scope

- User registration, password storage, password recovery, billing, and full
  RBAC.
- Real identity-provider credentials or deployment.

## Technical Notes

- Parent research: `../06-22-phase-7-pre-deployment-hardening/research/operator-authentication.md`.
- Preserve existing Chatwoot HMAC and tenant database constraints.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:api:integration`
- `npm run test:web:e2e`
- Phase 1 and production Compose configuration validation
- `python3 ./.trellis/scripts/task.py validate 06-22-phase-7a-oidc-operator-access`
