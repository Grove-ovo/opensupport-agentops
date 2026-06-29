import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createProductionMockServer } from './production-mock.mjs';

test('CI production preparation writes private ephemeral configuration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-ci-production-'));
  try {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/prepare-ci-production.mjs')],
      {
        cwd: directory,
        env: {
          ...process.env,
          GITHUB_SHA: 'a'.repeat(40),
        },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'prepared');
    for (const path of [
      '.env.ci.preflight',
      '.env.ci.smoke',
      'secrets/agentops_master_key',
      'secrets/agentops_oidc_client_secret',
      'secrets/agentops_operator_session_key',
      'secrets/grafana_admin_password',
    ]) {
      assert.equal(statSync(join(directory, path)).mode & 0o077, 0);
    }
    const smoke = readFileSync(join(directory, '.env.ci.smoke'), 'utf8');
    assert.match(smoke, /AGENTOPS_OIDC_ISSUER=http:\/\/smoke-mock:18090/);
    assert.match(smoke, /SMOKE_OIDC_ISSUER=http:\/\/smoke-mock:18090/);
    assert.match(smoke, /SMOKE_OIDC_PUBLIC_ISSUER=http:\/\/127\.0\.0\.1:18090/);
    assert.match(smoke, /SMOKE_CHATWOOT_BASE_URL=http:\/\/smoke-mock:18090/);
    assert.match(smoke, /SMOKE_KEEP_DEMO_DATA=0/);
    assert.ok(!result.stdout.includes('AGENTOPS_POSTGRES_PASSWORD'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production mock uses browser-safe authorize endpoint', async () => {
  const server = createProductionMockServer({
    issuer: 'http://smoke-mock:18090',
    publicIssuer: 'http://127.0.0.1:18090',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/.well-known/openid-configuration`,
    );
    const discovery = await response.json();
    assert.equal(discovery.issuer, 'http://smoke-mock:18090');
    assert.equal(discovery.authorization_endpoint, 'http://127.0.0.1:18090/authorize');
    assert.equal(discovery.token_endpoint, 'http://smoke-mock:18090/token');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
});

test('Trivy allowlist generation rejects expired exceptions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-trivy-'));
  try {
    const allowlist = join(directory, 'allowlist.json');
    const output = join(directory, '.trivyignore');
    writeFileSync(allowlist, JSON.stringify({
      schema_version: 1,
      entries: [{
        id: 'CVE-2025-12345',
        owner: 'security@example.invalid',
        reason: 'Temporary upstream remediation exception',
        expires_on: '2020-01-01',
      }],
    }));
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/prepare-trivy-ignore.mjs')],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TRIVY_ALLOWLIST: allowlist,
          TRIVY_IGNORE_OUTPUT: output,
        },
        encoding: 'utf8',
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /expired_trivy_allowlist_entry/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
