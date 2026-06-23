import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const secrets = resolve(root, 'secrets');
const backupDir = resolve(root, 'tmp/ci-backups');
mkdirSync(secrets, { recursive: true, mode: 0o700 });
mkdirSync(backupDir, { recursive: true, mode: 0o700 });

const values = {
  postgres: secret(32),
  redis: secret(32),
  chatwootWebhook: secret(32),
  chatwootToken: secret(32),
  oidcClient: secret(40),
  grafana: secret(32),
  masterKey: `base64url:${randomBytes(32).toString('base64url')}`,
  sessionKey: randomBytes(32),
  buildVersion:
    process.env.GITHUB_SHA?.trim() || randomBytes(20).toString('hex'),
};

writeSecret('agentops_master_key', `${values.masterKey}\n`);
writeSecret('agentops_oidc_client_secret', `${values.oidcClient}\n`);
writeSecret('agentops_operator_session_key', values.sessionKey);
writeSecret('grafana_admin_password', `${values.grafana}\n`);

const common = {
  AGENTOPS_BUILD_VERSION: values.buildVersion,
  AGENTOPS_PUBLIC_PORT: '8088',
  AGENTOPS_POSTGRES_USER: 'agentops',
  AGENTOPS_POSTGRES_PASSWORD: values.postgres,
  AGENTOPS_POSTGRES_DB: 'agentops',
  AGENTOPS_POSTGRES_PORT: '55432',
  AGENTOPS_REDIS_PASSWORD: values.redis,
  AGENTOPS_REDIS_PORT: '56379',
  AGENTOPS_PROMETHEUS_PORT: '9090',
  AGENTOPS_GRAFANA_PORT: '3001',
  AGENTOPS_MASTER_KEY_FILE: '../../secrets/agentops_master_key',
  AGENTOPS_OIDC_CLIENT_ID: 'opensupport-agentops-ci',
  AGENTOPS_OIDC_CLIENT_SECRET_FILE:
    '../../secrets/agentops_oidc_client_secret',
  AGENTOPS_OPERATOR_SESSION_KEY_FILE:
    '../../secrets/agentops_operator_session_key',
  AGENTOPS_OPERATOR_SESSION_TTL_SECONDS: '900',
  AGENTOPS_BACKUP_DIR: backupDir,
  AGENTOPS_BACKUP_RETENTION_DAYS: '14',
  GRAFANA_ADMIN_USER: 'agentops-ci',
  GRAFANA_ADMIN_PASSWORD_FILE: '../../secrets/grafana_admin_password',
};

writeEnv('.env.ci.preflight', {
  ...common,
  AGENTOPS_PUBLIC_URL: 'https://agentops-ci.example.invalid',
  AGENTOPS_PUBLIC_SCHEME: 'https',
  AGENTOPS_HSTS_VALUE: 'max-age=31536000; includeSubDomains',
  AGENTOPS_OIDC_ISSUER:
    'https://identity-ci.example.invalid/realms/agentops',
  AGENTOPS_OIDC_CALLBACK_URI:
    'https://agentops-ci.example.invalid/api/v1/auth/callback',
  AGENTOPS_COOKIE_SECURE: 'true',
  AGENTOPS_PROVIDER_BASE_URLS_JSON:
    '{"openai":"https://api.openai.com"}',
  AGENTOPS_MODEL_PRICING_JSON:
    '{"smoke-model":{"inputCostPerMillion":0.5,"outputCostPerMillion":1.5}}',
  CHATWOOT_WEBHOOK_SECRET: values.chatwootWebhook,
  CHATWOOT_API_TOKEN: values.chatwootToken,
  SMOKE_CHATWOOT_WEBHOOK_SECRET: '',
  SMOKE_CHATWOOT_API_TOKEN: '',
});

writeEnv('.env.ci.smoke', {
  ...common,
  AGENTOPS_PUBLIC_URL: 'http://127.0.0.1:8088',
  AGENTOPS_PUBLIC_SCHEME: 'http',
  AGENTOPS_HSTS_VALUE: '',
  AGENTOPS_OIDC_ISSUER: 'http://host.docker.internal:18090',
  AGENTOPS_OIDC_CALLBACK_URI:
    'http://127.0.0.1:8088/api/v1/auth/callback',
  AGENTOPS_COOKIE_SECURE: 'false',
  AGENTOPS_PROVIDER_BASE_URLS_JSON:
    '{"openai":"http://host.docker.internal:18090"}',
  AGENTOPS_MODEL_PRICING_JSON:
    '{"smoke-model":{"inputCostPerMillion":0.5,"outputCostPerMillion":1.5}}',
  CHATWOOT_WEBHOOK_SECRET: '',
  CHATWOOT_API_TOKEN: '',
  SMOKE_CHATWOOT_WEBHOOK_SECRET: values.chatwootWebhook,
  SMOKE_CHATWOOT_API_TOKEN: values.chatwootToken,
});

process.stdout.write(
  `${JSON.stringify({
    status: 'prepared',
    build_version_hash: values.buildVersion.slice(0, 12),
  })}\n`,
);

function writeSecret(name, value) {
  const path = resolve(secrets, name);
  writeFileSync(path, value, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function writeEnv(name, env) {
  const path = resolve(root, name);
  const content = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  writeFileSync(path, `${content}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function secret(bytes) {
  return randomBytes(bytes).toString('base64url');
}
