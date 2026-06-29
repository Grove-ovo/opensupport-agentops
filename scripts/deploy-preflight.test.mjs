import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  renderMarkdown,
  runDeployPreflight,
  writeDeployReadinessReports,
} from './deploy-preflight-lib.mjs';

test('ephemeral production configuration reports ready without secret leakage', () => {
  const fixture = createFixture();
  try {
    const report = runDeployPreflight({
      repoRoot: process.cwd(),
      envFile: fixture.envFile,
      now: new Date('2026-06-22T00:00:00.000Z'),
    });
    assert.equal(report.status, 'ready');
    assert.equal(report.summary.blocked, 0);
    const paths = writeDeployReadinessReports(report, {
      jsonPath: join(fixture.directory, 'readiness.json'),
      markdownPath: join(fixture.directory, 'readiness.md'),
    });
    const output = [
      readFileSync(paths.jsonPath, 'utf8'),
      readFileSync(paths.markdownPath, 'utf8'),
      renderMarkdown(report),
    ].join('\n');
    for (const secret of fixture.secretValues) {
      assert.ok(!output.includes(secret), 'report must not contain secret content');
    }
    assert.match(output, /secret_file_valid/);
    assert.match(output, /sha256/);

    const cliJson = join(fixture.directory, 'cli-readiness.json');
    const cliMarkdown = join(fixture.directory, 'cli-readiness.md');
    const cli = spawnSync(
      process.execPath,
      [
        'scripts/deploy-preflight.mjs',
        '--env-file',
        fixture.envFile,
        '--json',
        cliJson,
        '--markdown',
        cliMarkdown,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).status, 'ready');
    assert.equal(JSON.parse(readFileSync(cliJson, 'utf8')).status, 'ready');
  } finally {
    fixture.cleanup();
  }
});

test('unsafe production configuration is blocked with stable reason codes', () => {
  const fixture = createFixture();
  try {
    chmodSync(fixture.sessionKeyFile, 0o644);
    writeEnv(fixture.envFile, {
      ...fixture.env,
      AGENTOPS_POSTGRES_PASSWORD: 'change-me',
      AGENTOPS_BUILD_VERSION: 'local',
      AGENTOPS_PUBLIC_SCHEME: 'http',
      AGENTOPS_COOKIE_SECURE: 'false',
      AGENTOPS_PROVIDER_BASE_URLS_JSON:
        '{"openai":"http://127.0.0.1:18090"}',
      SMOKE_CHATWOOT_API_TOKEN: 'smoke-token',
    });
    const report = runDeployPreflight({
      repoRoot: process.cwd(),
      envFile: fixture.envFile,
    });
    assert.equal(report.status, 'blocked');
    const reasons = new Set(report.checks.map((check) => check.reason_code));
    for (const reason of [
      'credential_weak_or_placeholder',
      'build_version_mutable_or_placeholder',
      'https_policy_incomplete',
      'provider_origin_unsafe',
      'secret_file_permissions_unsafe',
      'smoke_credentials_present',
    ]) {
      assert.ok(reasons.has(reason), `missing reason code ${reason}`);
    }
  } finally {
    fixture.cleanup();
  }
});

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'agentops-preflight-'));
  const backupDir = join(directory, 'backups');
  mkdirSync(backupDir, { mode: 0o700 });
  const masterKeyFile = join(directory, 'master-key');
  const oidcSecretFile = join(directory, 'oidc-client-secret');
  const sessionKeyFile = join(directory, 'session-key');
  const grafanaSecretFile = join(directory, 'grafana-password');
  const envFile = join(directory, '.env.production');
  const masterKey = `base64url:${Buffer.alloc(32, 21).toString('base64url')}`;
  const oidcSecret = 'Q3x5N8r2V6m9K4p7T1w8Y5z2A6c9F3h7';
  const sessionKey = Buffer.alloc(32, 22);
  const grafanaSecret = 'M4q8W2z6R9t3Y7p1F5h8K2n6';
  writeFileSync(masterKeyFile, `${masterKey}\n`, { mode: 0o600 });
  writeFileSync(oidcSecretFile, `${oidcSecret}\n`, { mode: 0o600 });
  writeFileSync(sessionKeyFile, sessionKey, { mode: 0o600 });
  writeFileSync(grafanaSecretFile, `${grafanaSecret}\n`, { mode: 0o600 });
  const env = {
    AGENTOPS_BUILD_VERSION: 'v1.2.3-a1b2c3d',
    AGENTOPS_POSTGRES_PASSWORD: 'P7m2X9q4R8v3N6k1C5h7W2z9',
    AGENTOPS_REDIS_PASSWORD: 'R8k3M6v1Q9x4T7n2F5w8Z3p6',
    AGENTOPS_POSTGRES_PORT: '55432',
    AGENTOPS_REDIS_PORT: '56379',
    AGENTOPS_PUBLIC_PORT: '8443',
    AGENTOPS_PROMETHEUS_PORT: '9090',
    AGENTOPS_GRAFANA_PORT: '3001',
    AGENTOPS_MASTER_KEY_FILE: masterKeyFile,
    AGENTOPS_OIDC_ISSUER: 'https://identity.acme.invalid/realms/agentops',
    AGENTOPS_OIDC_CLIENT_ID: 'opensupport-agentops-prod',
    AGENTOPS_OIDC_CLIENT_SECRET_FILE: oidcSecretFile,
    AGENTOPS_OIDC_CALLBACK_URI:
      'https://ops.acme.invalid/api/v1/auth/callback',
    AGENTOPS_OPERATOR_SESSION_KEY_FILE: sessionKeyFile,
    AGENTOPS_PUBLIC_URL: 'https://ops.acme.invalid',
    AGENTOPS_PUBLIC_SCHEME: 'https',
    AGENTOPS_COOKIE_SECURE: 'true',
    AGENTOPS_HSTS_VALUE: 'max-age=31536000; includeSubDomains',
    AGENTOPS_PROVIDER_BASE_URLS_JSON:
      '{"openai":"https://api.openai.com"}',
    AGENTOPS_MODEL_PRICING_JSON:
      '{"gpt-4.1-mini":{"inputCostPerMillion":0.4,"outputCostPerMillion":1.6}}',
    CHATWOOT_WEBHOOK_SECRET: 'C7v2N9m4R6x1T8q3W5k7F2h9',
    CHATWOOT_API_TOKEN: 'A9w3K6p1Y8r4M7n2Q5x9T3v6',
    GRAFANA_ADMIN_USER: 'agentops-admin',
    GRAFANA_ADMIN_PASSWORD_FILE: grafanaSecretFile,
    AGENTOPS_BACKUP_DIR: backupDir,
    AGENTOPS_BACKUP_RETENTION_DAYS: '30',
    SMOKE_CHATWOOT_WEBHOOK_SECRET: '',
    SMOKE_CHATWOOT_API_TOKEN: '',
  };
  writeEnv(envFile, env);
  return {
    directory,
    envFile,
    env,
    sessionKeyFile,
    secretValues: [
      masterKey,
      oidcSecret,
      sessionKey.toString('hex'),
      grafanaSecret,
      env.AGENTOPS_POSTGRES_PASSWORD,
      env.AGENTOPS_REDIS_PASSWORD,
      env.CHATWOOT_WEBHOOK_SECRET,
      env.CHATWOOT_API_TOKEN,
    ],
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('non-blocking operational gaps report warning', () => {
  const fixture = createFixture();
  try {
    const { AGENTOPS_BACKUP_RETENTION_DAYS: _retention, ...withoutRetention } =
      fixture.env;
    writeEnv(fixture.envFile, withoutRetention);
    const report = runDeployPreflight({
      repoRoot: process.cwd(),
      envFile: fixture.envFile,
    });
    assert.equal(report.status, 'warning');
    assert.ok(
      report.checks.some(
        (check) =>
          check.reason_code === 'backup_retention_not_configured' &&
          check.status === 'warning',
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

function writeEnv(path, values) {
  const content = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  writeFileSync(path, `${content}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}
