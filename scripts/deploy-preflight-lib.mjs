import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';

const UNSAFE_WORDS = [
  'change-me',
  'default',
  'example',
  'local',
  'password',
  'replace',
  'smoke',
  'test',
];

export function runDeployPreflight(options) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const envFile = resolve(repoRoot, options.envFile ?? '.env.production');
  const composeFile = resolve(
    repoRoot,
    options.composeFile ?? 'infra/docker/compose.production.yml',
  );
  const checks = [];
  let env = {};

  if (!existsSync(envFile)) {
    blocked(checks, 'env_file', 'env_file_missing', {
      path: relativePath(repoRoot, envFile),
    });
  } else {
    const metadata = fileMetadata(repoRoot, envFile);
    if (!metadata.regular_file || metadata.symlink) {
      blocked(checks, 'env_file', 'env_file_type_unsafe', metadata);
    } else if (metadata.mode !== '0600') {
      blocked(checks, 'env_file', 'env_file_permissions_unsafe', metadata);
    } else {
      ready(checks, 'env_file', 'env_file_secure', metadata);
    }
    env = parseEnv(readFileSync(envFile, 'utf8'));
  }

  validateRequiredValues(checks, env);
  validatePasswords(checks, env);
  validateSecretFiles(checks, env, repoRoot, composeFile);
  validateOidcAndPublicOrigin(checks, env);
  validateProviderConfiguration(checks, env);
  validateBuildAndPorts(checks, env);
  validateOperations(checks, env, repoRoot, composeFile);
  validateSmokeIsolation(checks, env);

  const status = checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'ready';
  return {
    schema_version: 1,
    generated_at: (options.now ?? new Date()).toISOString(),
    status,
    summary: {
      ready: checks.filter((check) => check.status === 'ready').length,
      warning: checks.filter((check) => check.status === 'warning').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
    },
    checks,
  };
}

export function writeDeployReadinessReports(report, options = {}) {
  const jsonPath = resolve(options.jsonPath ?? 'tmp/deploy-readiness.json');
  const markdownPath = resolve(
    options.markdownPath ?? 'tmp/deploy-readiness.md',
  );
  mkdirSync(dirname(jsonPath), { recursive: true });
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(markdownPath, renderMarkdown(report), { mode: 0o600 });
  return { jsonPath, markdownPath };
}

export function renderMarkdown(report) {
  const rows = report.checks.map((check) => {
    const evidence = Object.entries(check.evidence ?? {})
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
    return `| ${check.id} | ${check.status} | ${check.reason_code} | ${evidence || '-'} |`;
  });
  return [
    '# Deploy Readiness Report',
    '',
    `Status: **${report.status}**`,
    '',
    `Generated: ${report.generated_at}`,
    '',
    `Ready: ${report.summary.ready} | Warning: ${report.summary.warning} | Blocked: ${report.summary.blocked}`,
    '',
    '| Check | Status | Reason | Evidence |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function validateRequiredValues(checks, env) {
  const required = [
    'AGENTOPS_POSTGRES_PASSWORD',
    'AGENTOPS_REDIS_PASSWORD',
    'AGENTOPS_BUILD_VERSION',
    'AGENTOPS_MASTER_KEY_FILE',
    'AGENTOPS_OIDC_ISSUER',
    'AGENTOPS_OIDC_CLIENT_ID',
    'AGENTOPS_OIDC_CLIENT_SECRET_FILE',
    'AGENTOPS_OIDC_CALLBACK_URI',
    'AGENTOPS_OPERATOR_SESSION_KEY_FILE',
    'AGENTOPS_PUBLIC_URL',
    'AGENTOPS_PUBLIC_SCHEME',
    'AGENTOPS_HSTS_VALUE',
    'GRAFANA_ADMIN_USER',
    'GRAFANA_ADMIN_PASSWORD_FILE',
    'AGENTOPS_PROVIDER_BASE_URLS_JSON',
    'AGENTOPS_MODEL_PRICING_JSON',
    'CHATWOOT_WEBHOOK_SECRET',
    'CHATWOOT_API_TOKEN',
    'AGENTOPS_BACKUP_DIR',
  ];
  for (const key of required) {
    if (!hasValue(env[key])) {
      blocked(checks, `required:${key}`, 'required_value_missing', { key });
    } else {
      ready(checks, `required:${key}`, 'required_value_present', { key });
    }
  }
}

function validatePasswords(checks, env) {
  for (const key of [
    'AGENTOPS_POSTGRES_PASSWORD',
    'AGENTOPS_REDIS_PASSWORD',
    'CHATWOOT_WEBHOOK_SECRET',
    'CHATWOOT_API_TOKEN',
  ]) {
    const value = env[key] ?? '';
    if (!hasValue(value)) continue;
    if (value.length < 20 || unsafeValue(value)) {
      blocked(checks, `strength:${key}`, 'credential_weak_or_placeholder', {
        key,
        length: value.length,
      });
    } else {
      ready(checks, `strength:${key}`, 'credential_strength_valid', {
        key,
        length: value.length,
        fingerprint: fingerprint(value),
      });
    }
  }
  const values = [
    env.AGENTOPS_POSTGRES_PASSWORD,
    env.AGENTOPS_REDIS_PASSWORD,
    env.CHATWOOT_WEBHOOK_SECRET,
    env.CHATWOOT_API_TOKEN,
  ].filter(hasValue);
  if (new Set(values.map(fingerprint)).size !== values.length) {
    blocked(checks, 'credential_uniqueness', 'credentials_reused');
  } else if (values.length > 0) {
    ready(checks, 'credential_uniqueness', 'credentials_unique', {
      count: values.length,
    });
  }
}

function validateSecretFiles(checks, env, repoRoot, composeFile) {
  const definitions = [
    ['master_key', env.AGENTOPS_MASTER_KEY_FILE, 32, validateMasterKey],
    ['oidc_client_secret', env.AGENTOPS_OIDC_CLIENT_SECRET_FILE, 32],
    ['operator_session_key', env.AGENTOPS_OPERATOR_SESSION_KEY_FILE, 32, exact32],
    ['grafana_admin_password', env.GRAFANA_ADMIN_PASSWORD_FILE, 20],
  ];
  const fingerprints = [];
  for (const [id, pathValue, minimumBytes, validate] of definitions) {
    if (!hasValue(pathValue)) continue;
    const path = deploymentPath(pathValue, composeFile);
    if (!existsSync(path)) {
      blocked(checks, `secret:${id}`, 'secret_file_missing', {
        path: relativePath(repoRoot, path),
      });
      continue;
    }
    const metadata = fileMetadata(repoRoot, path);
    const content = readFileSync(path);
    if (!metadata.regular_file || metadata.symlink) {
      blocked(checks, `secret:${id}`, 'secret_file_type_unsafe', metadata);
      continue;
    }
    if ((statSync(path).mode & 0o077) !== 0) {
      blocked(checks, `secret:${id}`, 'secret_file_permissions_unsafe', metadata);
      continue;
    }
    if (content.length < minimumBytes || (validate && !validate(content))) {
      blocked(checks, `secret:${id}`, 'secret_file_invalid', metadata);
      continue;
    }
    fingerprints.push(metadata.sha256);
    ready(checks, `secret:${id}`, 'secret_file_valid', metadata);
  }
  if (
    fingerprints.length > 1 &&
    new Set(fingerprints).size !== fingerprints.length
  ) {
    blocked(checks, 'secret_uniqueness', 'secret_files_reused');
  } else if (fingerprints.length > 0) {
    ready(checks, 'secret_uniqueness', 'secret_files_unique', {
      count: fingerprints.length,
    });
  }
}

function validateOidcAndPublicOrigin(checks, env) {
  const publicUrl = safeUrl(env.AGENTOPS_PUBLIC_URL);
  const issuer = safeUrl(env.AGENTOPS_OIDC_ISSUER);
  const callback = safeUrl(env.AGENTOPS_OIDC_CALLBACK_URI);
  if (!secureUrl(publicUrl)) {
    blocked(checks, 'public_url', 'public_url_invalid');
  } else if (
    publicUrl.pathname !== '/' ||
    publicUrl.search.length > 0 ||
    publicUrl.hash.length > 0
  ) {
    blocked(checks, 'public_url', 'public_url_invalid');
  } else {
    ready(checks, 'public_url', 'public_url_valid', {
      origin_hash: fingerprint(publicUrl.origin),
    });
  }
  if (
    !secureUrl(issuer) ||
    issuer.search.length > 0 ||
    issuer.hash.length > 0
  ) {
    blocked(checks, 'oidc_issuer', 'oidc_issuer_invalid');
  } else {
    ready(checks, 'oidc_issuer', 'oidc_issuer_valid', {
      origin_hash: fingerprint(issuer.origin),
    });
  }
  if (
    !secureUrl(callback) ||
    callback.pathname !== '/api/v1/auth/callback' ||
    callback.search.length > 0 ||
    callback.hash.length > 0
  ) {
    blocked(checks, 'oidc_callback', 'oidc_callback_invalid');
  } else if (publicUrl && callback.origin !== publicUrl.origin) {
    blocked(checks, 'oidc_callback', 'oidc_callback_origin_mismatch');
  } else {
    ready(checks, 'oidc_callback', 'oidc_callback_valid', {
      path: callback.pathname,
    });
  }
  if (
    env.AGENTOPS_PUBLIC_SCHEME !== 'https' ||
    env.AGENTOPS_COOKIE_SECURE !== 'true' ||
    !hasValue(env.AGENTOPS_HSTS_VALUE)
  ) {
    blocked(checks, 'https_policy', 'https_policy_incomplete');
  } else {
    ready(checks, 'https_policy', 'https_policy_valid');
  }
}

function validateProviderConfiguration(checks, env) {
  const providers = jsonObject(env.AGENTOPS_PROVIDER_BASE_URLS_JSON);
  if (providers === null || Object.keys(providers).length === 0) {
    blocked(checks, 'provider_origins', 'provider_origins_invalid');
  } else {
    const invalid = Object.values(providers).some((value) => {
      const url = typeof value === 'string' ? safeUrl(value) : null;
      return (
        !secureUrl(url) ||
        url.search.length > 0 ||
        url.hash.length > 0 ||
        privateHost(url.hostname)
      );
    });
    if (invalid) {
      blocked(checks, 'provider_origins', 'provider_origin_unsafe');
    } else {
      ready(checks, 'provider_origins', 'provider_origins_valid', {
        count: Object.keys(providers).length,
        config_hash: fingerprint(stableJson(providers)),
      });
    }
  }
  const pricing = jsonObject(env.AGENTOPS_MODEL_PRICING_JSON);
  const validPricing =
    pricing !== null &&
    Object.keys(pricing).length > 0 &&
    Object.values(pricing).every((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return false;
      }
      return ['inputCostPerMillion', 'outputCostPerMillion'].every((key) => {
        const value = Reflect.get(entry, key);
        return typeof value === 'number' && Number.isFinite(value) && value >= 0;
      });
    });
  if (!validPricing) {
    blocked(checks, 'model_pricing', 'model_pricing_invalid');
  } else {
    ready(checks, 'model_pricing', 'model_pricing_valid', {
      count: Object.keys(pricing).length,
      config_hash: fingerprint(stableJson(pricing)),
    });
  }
}

function validateBuildAndPorts(checks, env) {
  const version = env.AGENTOPS_BUILD_VERSION ?? '';
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{6,127}$/u.test(version) ||
    unsafeValue(version) ||
    version === 'latest'
  ) {
    blocked(checks, 'build_version', 'build_version_mutable_or_placeholder');
  } else {
    ready(checks, 'build_version', 'build_version_immutable', {
      fingerprint: fingerprint(version),
    });
  }
  const portKeys = [
    'AGENTOPS_PUBLIC_PORT',
    'AGENTOPS_POSTGRES_PORT',
    'AGENTOPS_REDIS_PORT',
    'AGENTOPS_PROMETHEUS_PORT',
    'AGENTOPS_GRAFANA_PORT',
  ];
  const ports = portKeys.map((key) => [key, Number(env[key])]);
  const invalid = ports.some(
    ([, value]) => !Number.isInteger(value) || value < 1 || value > 65_535,
  );
  const values = ports.map(([, value]) => value);
  if (invalid || new Set(values).size !== values.length) {
    blocked(checks, 'ports', 'ports_invalid_or_conflicting', {
      keys: portKeys.join(','),
    });
  } else {
    ready(checks, 'ports', 'ports_valid', { count: ports.length });
  }
}

function validateOperations(checks, env, repoRoot, composeFile) {
  const compose = existsSync(composeFile) ? readFileSync(composeFile, 'utf8') : '';
  const monitoring = [
    'infra/observability/prometheus.yml',
    'infra/observability/alerts.yml',
    'infra/observability/grafana/provisioning',
  ].every((path) => existsSync(resolve(repoRoot, path)));
  if (
    !monitoring ||
    !compose.includes('127.0.0.1:${AGENTOPS_PROMETHEUS_PORT') ||
    !compose.includes('127.0.0.1:${AGENTOPS_GRAFANA_PORT')
  ) {
    blocked(checks, 'monitoring', 'monitoring_configuration_incomplete');
  } else {
    ready(checks, 'monitoring', 'monitoring_configuration_valid');
  }
  if (!compose.includes('AGENTOPS_REQUIRED_MIGRATION: "16"')) {
    blocked(checks, 'migration', 'required_migration_invalid');
  } else {
    ready(checks, 'migration', 'required_migration_valid', { version: 16 });
  }
  if (!compose.includes('${AGENTOPS_BACKUP_DIR:?set AGENTOPS_BACKUP_DIR}:/backups')) {
    blocked(checks, 'backup_mount', 'backup_mount_not_bound');
  } else {
    ready(checks, 'backup_mount', 'backup_mount_bound');
  }
  const backupPath = env.AGENTOPS_BACKUP_DIR;
  if (!hasValue(backupPath) || !isAbsolute(backupPath)) {
    blocked(checks, 'backup_path', 'backup_path_invalid');
  } else if (!existsSync(backupPath) || !statSync(backupPath).isDirectory()) {
    blocked(checks, 'backup_path', 'backup_path_missing');
  } else {
    try {
      accessSync(backupPath, constants.W_OK);
      ready(checks, 'backup_path', 'backup_path_writable', {
        path_hash: fingerprint(backupPath),
      });
    } catch {
      blocked(checks, 'backup_path', 'backup_path_not_writable');
    }
  }
  const retentionDays = Number(env.AGENTOPS_BACKUP_RETENTION_DAYS);
  if (!hasValue(env.AGENTOPS_BACKUP_RETENTION_DAYS)) {
    warning(checks, 'backup_retention', 'backup_retention_not_configured');
  } else if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 7 ||
    retentionDays > 365
  ) {
    blocked(checks, 'backup_retention', 'backup_retention_invalid');
  } else {
    ready(checks, 'backup_retention', 'backup_retention_valid', {
      days: retentionDays,
    });
  }
}

function validateSmokeIsolation(checks, env) {
  const configured = Object.entries(env)
    .filter(([key, value]) => key.startsWith('SMOKE_') && hasValue(value))
    .map(([key]) => key);
  if (configured.length > 0) {
    blocked(checks, 'smoke_isolation', 'smoke_credentials_present', {
      keys: configured.sort().join(','),
    });
  } else {
    ready(checks, 'smoke_isolation', 'smoke_credentials_absent');
  }
}

function ready(checks, id, reasonCode, evidence) {
  checks.push({ id, status: 'ready', reason_code: reasonCode, evidence });
}

function blocked(checks, id, reasonCode, evidence) {
  checks.push({ id, status: 'blocked', reason_code: reasonCode, evidence });
}

function warning(checks, id, reasonCode, evidence) {
  checks.push({ id, status: 'warning', reason_code: reasonCode, evidence });
}

function parseEnv(source) {
  const result = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function fileMetadata(repoRoot, path) {
  const stat = lstatSync(path);
  const content = readFileSync(path);
  return {
    path: relativePath(repoRoot, path),
    mode: `0${(stat.mode & 0o777).toString(8).padStart(3, '0')}`,
    bytes: stat.size,
    sha256: createHash('sha256').update(content).digest('hex').slice(0, 16),
    regular_file: stat.isFile(),
    symlink: stat.isSymbolicLink(),
  };
}

function deploymentPath(value, composeFile) {
  return isAbsolute(value) ? value : resolve(dirname(composeFile), value);
}

function relativePath(root, path) {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}

function validateMasterKey(content) {
  const value = content.toString('utf8').trim();
  const match = /^(?:base64|base64url|hex):(.+)$/u.exec(value);
  if (!match) return false;
  const encoding = value.startsWith('hex:')
    ? 'hex'
    : value.startsWith('base64url:')
      ? 'base64url'
      : 'base64';
  try {
    return Buffer.from(match[1], encoding).length === 32;
  } catch {
    return false;
  }
}

function exact32(content) {
  return content.length === 32;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function unsafeValue(value) {
  const normalized = value.toLowerCase();
  return UNSAFE_WORDS.some((word) => normalized.includes(word));
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function safeUrl(value) {
  if (!hasValue(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

function secureUrl(url) {
  return url !== null && url.protocol === 'https:';
}

function privateHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.internal') ||
    /^10\./u.test(hostname) ||
    /^192\.168\./u.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./u.test(hostname)
  );
}

function jsonObject(value) {
  if (!hasValue(value)) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function stableJson(value) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    )),
  );
}
