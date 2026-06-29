# Phase 7B: Edge And Transport Hardening

## Goal

Harden the public Nginx/API boundary against request abuse and unsafe transport
defaults without requiring actual TLS deployment.

## Requirements

- Add endpoint-class rate limits for auth, Chatwoot ingress, reads, and writes.
- Add bounded request bodies, headers, connections, keepalive, and upstream
  timeouts.
- Add CSP, Permissions-Policy, cache controls, secure proxy headers, and
  HTTPS/HSTS behavior configurable for external TLS termination.
- Preserve stable `401`, `403`, `413`, `429`, and timeout responses.
- Ensure health probes and internal Prometheus scraping remain reliable.
- Add abuse, header spoofing, callback, and boundary tests.

## Acceptance Criteria

- [x] Oversized requests fail before application processing.
- [x] Rate limits are isolated by endpoint class and trusted identity/source.
- [x] Security headers are present on HTML and API responses.
- [x] Spoofed forwarded identity or scheme headers are not trusted publicly.
- [x] Chatwoot retry behavior is compatible with limits and stable responses.

## Out Of Scope

- Issuing certificates or exposing the service publicly.

## Verification

- `npm run test:phase7b`
- `npm run test:phase7b:container`
- `npm run test:api`
- `npm run test:web`
- `npm run test:web:e2e`
- `npm run typecheck`
- `npm run lint`
- Production Compose config and image `nginx -t`
