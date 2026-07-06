import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest, normalizeOrigin } from './index.mjs';

test('reports degraded readiness when no AgentOps origin is configured', async () => {
  const response = await handleRequest(new Request('https://edge.example/__agentops/edge-ready'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'degraded');
  assert.equal(body.backend_origin_configured, false);
  assert.equal(body.capabilities.native_postgres_redis, false);
});

test('fails API requests closed without an origin', async () => {
  const response = await handleRequest(new Request('https://edge.example/api/v1/auth/session'));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, 'backend_origin_missing');
});

test('proxies API requests to the configured AgentOps origin', async () => {
  const seen = {};
  const response = await handleRequest(
    new Request('https://edge.example/api/v1/tenants?limit=1', {
      headers: {
        host: 'edge.example',
        forwarded: 'for=198.51.100.1;proto=http',
        'cf-connecting-ip': '203.0.113.10',
        'true-client-ip': '198.51.100.2',
        'x-client-ip': '198.51.100.3',
        'x-forwarded-for': '198.51.100.4',
        'x-forwarded-host': 'spoofed.example',
        'x-forwarded-proto': 'http',
        'x-forwarded-user': 'spoofed',
        'x-real-ip': '198.51.100.5',
        accept: 'application/json',
      },
    }),
    { AGENTOPS_ORIGIN_URL: 'https://agentops.example/base-ignored' },
    {
      fetch: async (url, init) => {
        seen.url = url;
        seen.headers = init.headers;
        return Response.json({ ok: true }, { status: 202 });
      },
    },
  );

  assert.equal(response.status, 202);
  assert.equal(seen.url, 'https://agentops.example/api/v1/tenants?limit=1');
  assert.equal(seen.headers.get('host'), null);
  assert.equal(seen.headers.get('forwarded'), null);
  assert.equal(seen.headers.get('cf-connecting-ip'), null);
  assert.equal(seen.headers.get('true-client-ip'), null);
  assert.equal(seen.headers.get('x-client-ip'), null);
  assert.equal(seen.headers.get('x-forwarded-for'), null);
  assert.equal(seen.headers.get('x-forwarded-host'), null);
  assert.equal(seen.headers.get('x-forwarded-proto'), 'https');
  assert.equal(seen.headers.get('x-forwarded-user'), null);
  assert.equal(seen.headers.get('x-real-ip'), null);
  assert.equal(seen.headers.get('x-agentops-edge-proxy'), 'cloudflare-temporary');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-agentops-edge-proxy'), 'cloudflare-temporary');
});

test('does not broaden the exact worker metrics proxy route', async () => {
  const response = await handleRequest(new Request('https://edge.example/worker/metrics-extra'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
});

test('serves a static shell that describes temporary deployment limits', async () => {
  const response = await handleRequest(new Request('https://edge.example/'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  const html = await response.text();
  assert.match(html, /temporary edge deployment/);
  assert.match(html, /not the full AgentOps backend/);
});

test('normalizes only HTTP and HTTPS origins', () => {
  assert.equal(normalizeOrigin('https://agentops.example/path'), 'https://agentops.example');
  assert.equal(normalizeOrigin('http://localhost:8088'), 'http://localhost:8088');
  assert.equal(normalizeOrigin('file:///tmp/socket'), null);
  assert.equal(normalizeOrigin('not a url'), null);
  assert.equal(normalizeOrigin(''), null);
});
