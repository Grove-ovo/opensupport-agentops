import { createServer } from 'node:http';

export function createProductionMockServer(options = {}) {
  const messages = [];
  const issuer =
    options.issuer ??
    process.env.SMOKE_OIDC_ISSUER ??
    'http://host.docker.internal:18090';
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', issuer);
    const body = await readBody(request);
    response.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/__smoke/health') {
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (url.pathname === '/__smoke/reset' && request.method === 'POST') {
      messages.length = 0;
      response.end(JSON.stringify({ reset: true }));
      return;
    }
    if (url.pathname === '/__smoke/state') {
      response.end(JSON.stringify({ messages }));
      return;
    }
    if (url.pathname === '/.well-known/openid-configuration') {
      response.end(JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        code_challenge_methods_supported: ['S256'],
      }));
      return;
    }
    if (url.pathname === '/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      if (!redirectUri || !state) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'invalid_authorization_request' }));
        return;
      }
      const callback = new URL(redirectUri);
      callback.searchParams.set('code', 'smoke-code');
      callback.searchParams.set('state', state);
      response.statusCode = 302;
      response.setHeader('Location', callback.toString());
      response.end();
      return;
    }
    if (url.pathname === '/token') {
      response.end(JSON.stringify({
        access_token: 'smoke-access-token',
        token_type: 'Bearer',
        expires_in: 300,
      }));
      return;
    }
    if (url.pathname === '/userinfo') {
      response.end(JSON.stringify({
        sub: 'smoke-admin',
        name: 'Production Smoke Admin',
        email: 'smoke-admin@example.invalid',
        agentops_roles: ['admin'],
        agentops_tenants: ['*'],
      }));
      return;
    }
    if (url.pathname === '/v1/chat/completions') {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          reply: 'Order SMOKE-100 is currently shipped.',
        }) } }],
        usage: { prompt_tokens: 24, completion_tokens: 9 },
      }));
      return;
    }
    if (url.pathname.endsWith('/messages')) {
      messages.push(JSON.parse(body));
      response.end(JSON.stringify({ id: messages.length }));
      return;
    }
    if (url.pathname.endsWith('/toggle_status')) {
      response.end(JSON.stringify({ success: true }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
