const PROXY_ROUTES = [
  { prefix: '/api/' },
  { prefix: '/health/' },
  { prefix: '/worker/health/' },
  { exact: '/worker/metrics' },
];

const untrustedForwardingHeaders = [
  'host',
  'forwarded',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-user',
  'x-real-ip',
];

const securityHeaders = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

export default {
  fetch(request, env) {
    return handleRequest(request, env, { fetch });
  },
};

export async function handleRequest(request, env = {}, runtime = { fetch }) {
  const url = new URL(request.url);
  const origin = normalizeOrigin(env.AGENTOPS_ORIGIN_URL);

  if (url.pathname === '/__agentops/edge-ready') {
    return jsonResponse(edgeReadiness(origin, env), 200);
  }

  if (shouldProxy(url.pathname)) {
    if (origin === null) {
      return jsonResponse({
        status: 'degraded',
        error: {
          code: 'backend_origin_missing',
          message: 'Set AGENTOPS_ORIGIN_URL to proxy API and health requests to a full AgentOps deployment.',
        },
      }, 503);
    }
    return proxyToOrigin(request, origin, runtime.fetch);
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    return htmlResponse(renderShell(edgeReadiness(origin, env)));
  }

  return jsonResponse({
    error: {
      code: 'not_found',
      message: 'This temporary edge deployment serves the readiness shell and optional API proxy only.',
    },
  }, 404);
}

export function normalizeOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function shouldProxy(pathname) {
  return PROXY_ROUTES.some((route) => {
    if (route.exact !== undefined) return pathname === route.exact;
    return pathname.startsWith(route.prefix);
  });
}

function edgeReadiness(origin, env) {
  return {
    status: origin === null ? 'degraded' : 'ready',
    service: 'opensupport-agentops-edge',
    mode: env.AGENTOPS_EDGE_MODE ?? 'temporary',
    temporary_deployment: true,
    backend_origin_configured: origin !== null,
    capabilities: {
      static_readiness_shell: true,
      api_proxy: origin !== null,
      native_fastify_api: false,
      native_postgres_redis: false,
      native_worker_runtime: false,
    },
    limitations: [
      'The full AgentOps runtime still requires the Node API, PostgreSQL/pgvector, Redis, worker, Chatwoot, and LLM provider services.',
      'This Cloudflare Worker target validates temporary edge deployment and optional proxy wiring only.',
    ],
  };
}

async function proxyToOrigin(request, origin, fetcher) {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(origin);
  targetUrl.pathname = sourceUrl.pathname;
  targetUrl.search = sourceUrl.search;

  const headers = new Headers(request.headers);
  for (const header of untrustedForwardingHeaders) {
    headers.delete(header);
  }
  headers.set('x-agentops-edge-proxy', 'cloudflare-temporary');
  headers.set('x-forwarded-proto', sourceUrl.protocol.replace(':', ''));

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  const response = await fetcher(targetUrl.toString(), init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('x-agentops-edge-proxy', 'cloudflare-temporary');
  responseHeaders.set('cache-control', 'no-store');
  for (const [name, value] of Object.entries(securityHeaders)) {
    responseHeaders.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function jsonResponse(body, status) {
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    status,
    headers: {
      ...securityHeaders,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function htmlResponse(body) {
  return new Response(body, {
    headers: {
      ...securityHeaders,
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function renderShell(readiness) {
  const statusLabel = readiness.status === 'ready' ? 'Ready' : 'Degraded';
  const proxyLabel = readiness.backend_origin_configured ? 'configured' : 'not configured';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenSupport AgentOps Edge</title>
  <style>
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f6f8fb; }
    main { max-width: 880px; margin: 0 auto; padding: 48px 24px; }
    h1 { font-size: 34px; line-height: 1.15; margin: 0 0 12px; }
    p { color: #4b5870; line-height: 1.6; }
    .panel { background: #fff; border: 1px solid #dde3ee; border-radius: 6px; padding: 24px; box-shadow: 0 12px 32px rgba(18, 30, 52, 0.08); }
    .status { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; background: ${readiness.status === 'ready' ? '#e7f7ef' : '#fff4d6'}; color: ${readiness.status === 'ready' ? '#136b3a' : '#7a4f00'}; font-weight: 700; }
    code { background: #edf1f7; padding: 2px 5px; border-radius: 4px; }
    ul { color: #4b5870; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <span class="status">${escapeHtml(statusLabel)}</span>
      <h1>OpenSupport AgentOps temporary edge deployment</h1>
      <p>This Cloudflare Worker target validates edge deployment and optional proxy wiring. It is not the full AgentOps backend.</p>
      <ul>
        <li>API origin: <strong>${escapeHtml(proxyLabel)}</strong></li>
        <li>Readiness JSON: <code>/__agentops/edge-ready</code></li>
        <li>Proxy paths: <code>/api/*</code>, <code>/health/*</code>, <code>/worker/health/*</code>, <code>/worker/metrics</code></li>
      </ul>
      <p>The full product still requires the Node API, PostgreSQL/pgvector, Redis, worker, Chatwoot, and LLM provider services.</p>
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
