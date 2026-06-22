# Edge And Transport Security

The production Web image is the only public Compose service. Nginx enforces
request limits before proxying to the API, while Fastify retains direct-service
body and socket timeout limits.

## Endpoint Classes

| Class | Key | Sustained rate | Burst |
|---|---|---:|---:|
| OIDC auth | TCP source address | 5 requests/second | 10 |
| Chatwoot ingress | TCP source address | 30 requests/second | 60 |
| Operator reads | TCP source address | 20 requests/second | 40 |
| Operator writes | TCP source address | 5 requests/second | 10 |

Classes use independent zones so an auth burst cannot consume Chatwoot or
operator capacity. Nginx cannot validate the encrypted operator cookie, so it
must not use that client-controlled value as a trusted rate-limit identity.
OIDC identity and tenant authorization remain application-layer checks.

## Request Bounds

- Maximum body: 1 MiB at Nginx and Fastify.
- Client body timeout: 15 seconds.
- Client header timeout: 10 seconds.
- Header buffers: one 1 KiB buffer plus four 8 KiB large buffers.
- Per-source concurrent connections: 30.
- Keepalive: 20 seconds and 1,000 requests per socket.
- Upstream connect timeout: 3 seconds.
- API send/read timeout: 35 seconds.
- Health send/read timeout: 5 seconds.

Nginx emits stable JSON for `413`, `429`, and `504`. Application-generated
`401` and `403` responses pass through unchanged.

## Proxy Trust

Public request headers do not establish client identity or transport scheme.
Nginx replaces `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` from the
socket and deployment configuration, and clears forwarded identity headers.

Set `AGENTOPS_PUBLIC_SCHEME=https` only when an external TLS terminator is the
approved public entry point. Set `AGENTOPS_HSTS_VALUE` after HTTPS is confirmed.
The production example uses a one-year HSTS policy with subdomains.

## Browser Headers

HTML, assets, API responses, and edge-generated errors include CSP,
Permissions-Policy, Referrer-Policy, HSTS when configured,
`X-Content-Type-Options`, and `X-Frame-Options`.

Dashboard HTML and API responses use `Cache-Control: no-store`. Fingerprinted
static assets use a one-year immutable cache policy.
