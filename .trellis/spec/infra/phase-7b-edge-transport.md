# Phase 7B Edge Transport

## 1. Scope / Trigger

Use this contract when changing the public Nginx boundary, Fastify transport
limits, proxy trust, HTTP security headers, or endpoint-class rate limits.

## 2. Signatures

```text
Nginx public port: 8080
Auth:      /api/v1/auth/*
Chatwoot:  /api/v1/chatwoot/agent-bot/* and /api/v1/chatwoot/webhooks/*
Operator:  /api/v1/tenants/*
Probes:    /health/* and /worker/health/*
```

```text
AGENTOPS_PUBLIC_SCHEME
AGENTOPS_HSTS_VALUE
AGENTOPS_HTTP_BODY_LIMIT_BYTES
AGENTOPS_HTTP_REQUEST_TIMEOUT_MS
AGENTOPS_HTTP_CONNECTION_TIMEOUT_MS
AGENTOPS_HTTP_KEEPALIVE_TIMEOUT_MS
AGENTOPS_HTTP_MAX_REQUESTS_PER_SOCKET
```

## 3. Contracts

- Auth, Chatwoot, operator read, and operator write use independent Nginx
  request zones.
- Rate-limit identity is the actual TCP source address. Do not trust forwarded
  headers or an unverified encrypted cookie as identity.
- Nginx replaces `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`, and
  clears forwarded user headers before proxying.
- Nginx and Fastify both reject bodies above 1 MiB.
- Public/client, keepalive, connection, and upstream timeouts are bounded.
- Nginx emits JSON error envelopes for `413`, `429`, and `504`.
- CSP, Permissions-Policy, Referrer-Policy, HSTS when configured, nosniff,
  frame denial, and explicit cache control apply to all responses.
- Health endpoints do not consume auth/operator/Chatwoot rate zones.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Body exceeds 1 MiB | `413 payload_too_large`, no upstream call |
| Endpoint class exceeds zone | `429 rate_limited` |
| Upstream read deadline exceeded | `504 upstream_timeout` |
| Application session missing | Existing `401 authentication_required` |
| Application tenant denied | Existing `403 forbidden` |
| Client spoofs forwarded IP/scheme/user | Values are discarded/rebuilt |
| HSTS value empty | HSTS header omitted |
| HSTS configured after HTTPS approval | Exact configured value is emitted |

## 5. Good / Base / Bad Cases

- Good: auth saturation still allows Chatwoot and operator reads because zones
  are independent.
- Base: local HTTP sets `AGENTOPS_PUBLIC_SCHEME=http` and leaves HSTS empty.
- Bad: use `$proxy_add_x_forwarded_for` on the directly public listener.
- Bad: derive the rate key from a cookie Nginx cannot authenticate.
- Bad: configure one global low rate that causes Chatwoot retries to fail.

## 6. Tests Required

- Static validator checks zones, bounds, proxy header rebuilding, security
  headers, Fastify options, and environment keys.
- API injection proves oversized bodies fail before the handler.
- Build the Web image and run `nginx -t` after template substitution.
- Isolated container tests inspect HTML/API headers, spoofed header removal,
  stable `413`, stable `429`, and endpoint-class isolation.
- Run Dashboard browser tests to prove CSP and routing remain functional.
- Run Compose config, type-check, lint, API tests, and full repository tests.

## 7. Wrong vs Correct

### Wrong

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
limit_req_zone $cookie_agentops_operator zone=operator:10m rate=5r/s;
```

### Correct

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto ${AGENTOPS_PUBLIC_SCHEME};
proxy_set_header X-Forwarded-User "";
limit_req_zone $operator_write_key zone=agentops_operator_write:10m rate=5r/s;
```

## Scenario: Temporary Cloudflare Worker Edge Shell/Proxy

### 1. Scope / Trigger

- Trigger: adding or changing a Cloudflare Worker temporary deployment target,
  edge shell, or optional proxy in front of AgentOps.
- Applies to `apps/edge/**`, `docs/operations/cloudflare-temporary-deploy.md`,
  temporary deployment reports, and root package deploy/test scripts.

### 2. Signatures

```text
npm run test:edge
npm run deploy:cloudflare:temporary
```

```text
GET /                         -> temporary edge shell
GET /__agentops/edge-ready    -> secret-free readiness JSON
/api/*                        -> optional origin proxy
/health/*                     -> optional origin proxy
/worker/health/*              -> optional origin proxy
/worker/metrics               -> optional origin proxy, exact route only
```

```text
AGENTOPS_EDGE_MODE
AGENTOPS_ORIGIN_URL
```

### 3. Contracts

- Temporary Worker targets are shell/proxy targets only. They must not claim to
  run Fastify, PostgreSQL/pgvector, Redis, Redis Streams workers, Chatwoot, or
  LLM providers natively unless those capabilities are actually implemented and
  tested in Workers.
- `AGENTOPS_ORIGIN_URL` is optional. When absent, proxy routes fail closed with
  `503 backend_origin_missing`.
- Client-supplied source and forwarding headers are untrusted. Strip
  `Forwarded`, `CF-Connecting-IP`, `True-Client-IP`, `X-Client-IP`,
  `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`,
  `X-Forwarded-User`, and `X-Real-IP` before proxying.
- Rebuild only the forwarding fields the Worker can prove, such as
  `X-Forwarded-Proto` from the request URL protocol.
- Shell, readiness, and proxied responses must set explicit `cache-control:
  no-store` plus browser security headers.
- `wrangler` must be pinned in deploy scripts, for example
  `npx wrangler@<version> deploy --temporary`, so temporary deploy behavior
  does not drift silently.
- Cloudflare temporary claim URLs are secret-equivalent because they grant
  ownership of the preview account. Do not commit claim tokens.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| `AGENTOPS_ORIGIN_URL` missing on proxy route | `503 backend_origin_missing` |
| Client spoofs forwarded/source headers | Spoofed values are discarded before origin fetch |
| `/worker/metrics-extra` requested | Not proxied through the exact metrics route |
| Proxied origin returns cacheable headers | Worker response still emits `cache-control: no-store` |
| Temporary deploy succeeds | Record URL and Worker version ID, redact claim URL |
| Temporary deploy fails | Record exact command and non-secret failure reason |

### 5. Good / Base / Bad Cases

- Good: Worker URL serves a degraded shell, readiness reports
  `temporary_deployment=true`, and `/api/*` fails closed until an origin is
  configured.
- Base: Worker proxies `/api/*` to a full AgentOps origin while stripping
  untrusted forwarding headers and tagging the request with an edge marker.
- Bad: commit `claimToken=...` or claim a Worker-only URL proves full AgentOps
  product deployment.
- Bad: use an unpinned `npx wrangler deploy --temporary` command in committed
  scripts.

### 6. Tests Required

- Unit tests for readiness, static shell, fail-closed proxy behavior, successful
  proxy URL mapping, forwarded/source header stripping, response no-store, and
  exact `/worker/metrics` routing.
- `npm run test:edge`.
- `npm run lint`, `npm run typecheck`, and full repository tests before
  merging temporary deploy work.
- Real deployed smoke, when network access is available: `GET /`, `GET
  /__agentops/edge-ready`, and one proxy route without origin configured.
- Secret scan committed evidence for `claimToken=` and real Cloudflare claim
  URLs before commit.

### 7. Wrong vs Correct

#### Wrong

```js
headers.set('x-forwarded-for', request.headers.get('x-forwarded-for'));
```

#### Correct

```js
headers.delete('x-forwarded-for');
headers.delete('x-real-ip');
headers.set('x-forwarded-proto', new URL(request.url).protocol.replace(':', ''));
```
