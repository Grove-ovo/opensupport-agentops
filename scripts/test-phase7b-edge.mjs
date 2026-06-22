import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';

const suffix = `${process.pid}-${Date.now()}`;
const network = `agentops-phase7b-${suffix}`;
const apiContainer = `agentops-phase7b-api-${suffix}`;
const webContainer = `agentops-phase7b-web-${suffix}`;
const image = 'opensupport-agentops-web:phase7b-test';
const port = await availablePort();

try {
  run('docker', [
    'build',
    '-f',
    'infra/docker/Dockerfile.web',
    '-t',
    image,
    '.',
  ]);
  run('docker', ['network', 'create', network]);
  run('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    apiContainer,
    '--network',
    network,
    '--network-alias',
    'api',
    '--network-alias',
    'worker',
    'node:22-alpine',
    'node',
    '-e',
    `require('http').createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({headers:req.headers,url:req.url,method:req.method}))}).listen(8080,'0.0.0.0')`,
  ]);
  run('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    webContainer,
    '--network',
    network,
    '-p',
    `127.0.0.1:${port}:8080`,
    '-e',
    'AGENTOPS_PUBLIC_SCHEME=https',
    '-e',
    'AGENTOPS_HSTS_VALUE=max-age=31536000; includeSubDomains',
    image,
  ]);

  const baseUrl = `http://127.0.0.1:${port}`;
  const home = await poll(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(
    home.headers.get('content-security-policy') ?? '',
    /frame-ancestors 'none'/,
  );
  assert.equal(
    home.headers.get('permissions-policy'),
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  );
  assert.equal(
    home.headers.get('strict-transport-security'),
    'max-age=31536000; includeSubDomains',
  );
  assert.equal(home.headers.get('cache-control'), 'no-store');

  const spoofed = await fetch(`${baseUrl}/api/v1/tenants/test`, {
    headers: {
      'x-forwarded-for': '203.0.113.99',
      'x-forwarded-proto': 'http',
      'x-forwarded-user': 'attacker',
      'x-auth-request-user': 'attacker',
    },
  });
  const echoed = await spoofed.json();
  assert.equal(echoed.headers['x-forwarded-proto'], 'https');
  assert.notEqual(echoed.headers['x-forwarded-for'], '203.0.113.99');
  assert.equal(echoed.headers['x-forwarded-user'], undefined);
  assert.equal(echoed.headers['x-auth-request-user'], undefined);

  const oversized = await fetch(
    `${baseUrl}/api/v1/chatwoot/webhooks/00000000-0000-4000-8000-000000000001`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.alloc(1_126_400, 120),
    },
  );
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'payload_too_large');

  const authBurst = await Promise.all(
    Array.from({ length: 30 }, () =>
      fetch(`${baseUrl}/api/v1/auth/session`),
    ),
  );
  assert.ok(
    authBurst.some((response) => response.status === 429),
    'auth burst must hit its dedicated 429 limit',
  );
  const rateLimited = authBurst.find((response) => response.status === 429);
  assert.ok(rateLimited);
  assert.equal((await rateLimited.json()).error.code, 'rate_limited');

  const chatwoot = await fetch(
    `${baseUrl}/api/v1/chatwoot/webhooks/00000000-0000-4000-8000-000000000001`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    },
  );
  const operatorRead = await fetch(`${baseUrl}/api/v1/tenants/test`);
  assert.equal(chatwoot.status, 200);
  assert.equal(operatorRead.status, 200);

  process.stdout.write('Phase 7B container edge tests passed\n');
} finally {
  stop(webContainer);
  stop(apiContainer);
  removeNetwork(network);
}

function run(command, args) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function stop(name) {
  try {
    run('docker', ['stop', name]);
  } catch {
    // Container may not have been created.
  }
}

function removeNetwork(name) {
  try {
    run('docker', ['network', 'rm', name]);
  } catch {
    // Network may not have been created.
  }
}

async function poll(url) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error('edge container did not become ready');
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('failed to allocate a local port'));
        return;
      }
      const { port: selected } = address;
      server.close((error) =>
        error ? reject(error) : resolve(selected),
      );
    });
  });
}
