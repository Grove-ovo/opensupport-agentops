import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [nginx, proxy, dockerfile, compose, app, config] = await Promise.all([
  readFile('infra/docker/nginx.conf', 'utf8'),
  readFile('infra/docker/agentops-proxy.conf', 'utf8'),
  readFile('infra/docker/Dockerfile.web', 'utf8'),
  readFile('infra/docker/compose.production.yml', 'utf8'),
  readFile('apps/api/src/app.ts', 'utf8'),
  readFile('apps/api/src/config.ts', 'utf8'),
]);
const frontendSource = await readFile('apps/web/src/views/OverviewView.tsx', 'utf8');

for (const contract of [
  'client_max_body_size 1m',
  'large_client_header_buffers 4 8k',
  'limit_conn agentops_connections 30',
  'zone=agentops_auth',
  'zone=agentops_chatwoot',
  'zone=agentops_operator_read',
  'zone=agentops_operator_write',
  'limit_req_status 429',
  'error_page 413',
  'error_page 429',
  'error_page 504',
  'Content-Security-Policy',
  'Permissions-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
]) {
  assert.ok(nginx.includes(contract), `missing Nginx contract: ${contract}`);
}

assert.match(nginx, /location \/api\/v1\/auth\/[\s\S]*agentops_auth/);
assert.match(
  nginx,
  /location ~ \^\/api\/v1\/chatwoot\/[\s\S]*agentops_chatwoot/,
);
assert.match(
  nginx,
  /location \/api\/v1\/tenants\/[\s\S]*agentops_operator_read[\s\S]*agentops_operator_write/,
);

for (const contract of [
  'proxy_set_header X-Forwarded-For $remote_addr',
  'proxy_set_header X-Forwarded-Proto ${AGENTOPS_PUBLIC_SCHEME}',
  'proxy_set_header X-Forwarded-User ""',
  'proxy_set_header X-Auth-Request-User ""',
  'proxy_connect_timeout 3s',
]) {
  assert.ok(proxy.includes(contract), `missing proxy contract: ${contract}`);
}
assert.ok(
  nginx.includes('proxy_read_timeout 35s') &&
    nginx.includes('proxy_read_timeout 5s'),
  'API and health upstream timeouts must be bounded separately',
);
assert.ok(
  !frontendSource.includes('style={{'),
  'strict CSP requires the Dashboard to avoid inline style attributes',
);
assert.ok(
  !proxy.includes('$proxy_add_x_forwarded_for') &&
    !proxy.includes('$http_x_forwarded_proto'),
  'public client forwarded headers must not be trusted',
);
assert.ok(
  !nginx.includes('$cookie_agentops_operator'),
  'unverified client cookies must not be used as trusted rate-limit identity',
);

assert.ok(
  dockerfile.includes('NGINX_ENVSUBST_FILTER=^AGENTOPS_') &&
    dockerfile.includes('_agentops-proxy.inc.template'),
  'Nginx template substitution must be restricted to AgentOps variables',
);
assert.ok(
  compose.includes('AGENTOPS_PUBLIC_SCHEME') &&
    compose.includes('AGENTOPS_HSTS_VALUE'),
  'Compose must configure canonical public scheme and HSTS',
);

for (const contract of [
  'bodyLimit:',
  'requestTimeout:',
  'connectionTimeout:',
  'keepAliveTimeout:',
  'maxRequestsPerSocket:',
  "'payload_too_large'",
  "'rate_limited'",
  "'upstream_timeout'",
]) {
  assert.ok(app.includes(contract), `missing Fastify transport contract: ${contract}`);
}
for (const key of [
  'AGENTOPS_HTTP_BODY_LIMIT_BYTES',
  'AGENTOPS_HTTP_REQUEST_TIMEOUT_MS',
  'AGENTOPS_HTTP_CONNECTION_TIMEOUT_MS',
  'AGENTOPS_HTTP_KEEPALIVE_TIMEOUT_MS',
  'AGENTOPS_HTTP_MAX_REQUESTS_PER_SOCKET',
]) {
  assert.ok(config.includes(key), `missing API transport environment key: ${key}`);
}

process.stdout.write('Phase 7B edge and transport hardening validated\n');
