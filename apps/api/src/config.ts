import { readFileSync } from 'node:fs';
import { parseMasterKey } from '@opensupport/model-config';

export interface ApiConfig {
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  requiredMigration: number;
  dedupeTtlSeconds: number;
  shutdownTimeoutMs: number;
  buildVersion: string;
  logLevel: string;
  masterKey: string;
  masterKeyId: string;
  providerBaseUrls: Readonly<Record<string, string>>;
  modelPricing: Readonly<
    Record<
      string,
      { inputCostPerMillion: number; outputCostPerMillion: number }
    >
  >;
  pipelineDeadlineMs: number;
  approvalTtlMs: number;
  operatorAuth: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    callbackUri: string;
    roleClaim: string;
    tenantClaim: string;
    operatorRole: string;
    adminRole: string;
    sessionKeys: readonly Buffer[];
    sessionTtlSeconds: number;
    secureCookie: boolean;
  };
  transport: {
    bodyLimitBytes: number;
    requestTimeoutMs: number;
    connectionTimeoutMs: number;
    keepAliveTimeoutMs: number;
    maxRequestsPerSocket: number;
  };
}

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid API configuration: ${issues.join(', ')}`);
    this.name = 'ConfigError';
  }
}

export function loadApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const issues: string[] = [];
  const databaseUrl = requiredUrl(env.DATABASE_URL, 'DATABASE_URL', issues);
  const redisUrl = requiredUrl(env.REDIS_URL, 'REDIS_URL', issues);
  const port = integer(env.PORT ?? '8080', 'PORT', 1, 65_535, issues);
  const requiredMigration = integer(
    env.AGENTOPS_REQUIRED_MIGRATION ?? '16',
    'AGENTOPS_REQUIRED_MIGRATION',
    1,
    10_000,
    issues,
  );
  const dedupeTtlSeconds = integer(
    env.AGENTOPS_DEDUPE_TTL_SECONDS ?? '86400',
    'AGENTOPS_DEDUPE_TTL_SECONDS',
    60,
    604_800,
    issues,
  );
  const shutdownTimeoutMs = integer(
    env.AGENTOPS_SHUTDOWN_TIMEOUT_MS ?? '10000',
    'AGENTOPS_SHUTDOWN_TIMEOUT_MS',
    1_000,
    120_000,
    issues,
  );
  const pipelineDeadlineMs = integer(
    env.AGENTOPS_PIPELINE_DEADLINE_MS ?? '30000',
    'AGENTOPS_PIPELINE_DEADLINE_MS',
    1_000,
    120_000,
    issues,
  );
  const approvalTtlMs = integer(
    env.AGENTOPS_APPROVAL_TTL_MS ?? '86400000',
    'AGENTOPS_APPROVAL_TTL_MS',
    60_000,
    604_800_000,
    issues,
  );
  const providerBaseUrls = jsonRecord(
    env.AGENTOPS_PROVIDER_BASE_URLS_JSON,
    'AGENTOPS_PROVIDER_BASE_URLS_JSON',
    issues,
    validateUrlValue,
  );
  const modelPricing = jsonRecord(
    env.AGENTOPS_MODEL_PRICING_JSON,
    'AGENTOPS_MODEL_PRICING_JSON',
    issues,
    validatePricingValue,
  );
  const masterKey = requiredMasterKey(
    secretValue(
      env.AGENTOPS_MASTER_KEY,
      env.AGENTOPS_MASTER_KEY_FILE,
      'AGENTOPS_MASTER_KEY',
      issues,
    ),
    'AGENTOPS_MASTER_KEY',
    issues,
  );
  const operatorIssuer = requiredUrl(
    env.AGENTOPS_OIDC_ISSUER,
    'AGENTOPS_OIDC_ISSUER',
    issues,
  );
  const operatorCallbackUri = requiredUrl(
    env.AGENTOPS_OIDC_CALLBACK_URI,
    'AGENTOPS_OIDC_CALLBACK_URI',
    issues,
  );
  const operatorClientId = requiredString(
    env.AGENTOPS_OIDC_CLIENT_ID,
    'AGENTOPS_OIDC_CLIENT_ID',
    issues,
  );
  const operatorClientSecret = requiredString(
    secretValue(
      env.AGENTOPS_OIDC_CLIENT_SECRET,
      env.AGENTOPS_OIDC_CLIENT_SECRET_FILE,
      'AGENTOPS_OIDC_CLIENT_SECRET',
      issues,
    ),
    'AGENTOPS_OIDC_CLIENT_SECRET',
    issues,
  );
  const operatorSessionKeys = sessionKeys(
    env.AGENTOPS_OPERATOR_SESSION_KEY_FILES,
    issues,
  );
  const operatorSessionTtlSeconds = integer(
    env.AGENTOPS_OPERATOR_SESSION_TTL_SECONDS ?? '3600',
    'AGENTOPS_OPERATOR_SESSION_TTL_SECONDS',
    300,
    86_400,
    issues,
  );
  const secureCookie = boolean(
    env.AGENTOPS_COOKIE_SECURE ?? 'true',
    'AGENTOPS_COOKIE_SECURE',
    issues,
  );
  const bodyLimitBytes = integer(
    env.AGENTOPS_HTTP_BODY_LIMIT_BYTES ?? '1048576',
    'AGENTOPS_HTTP_BODY_LIMIT_BYTES',
    16_384,
    10_485_760,
    issues,
  );
  const requestTimeoutMs = integer(
    env.AGENTOPS_HTTP_REQUEST_TIMEOUT_MS ?? '35000',
    'AGENTOPS_HTTP_REQUEST_TIMEOUT_MS',
    1_000,
    120_000,
    issues,
  );
  const connectionTimeoutMs = integer(
    env.AGENTOPS_HTTP_CONNECTION_TIMEOUT_MS ?? '10000',
    'AGENTOPS_HTTP_CONNECTION_TIMEOUT_MS',
    1_000,
    60_000,
    issues,
  );
  const keepAliveTimeoutMs = integer(
    env.AGENTOPS_HTTP_KEEPALIVE_TIMEOUT_MS ?? '20000',
    'AGENTOPS_HTTP_KEEPALIVE_TIMEOUT_MS',
    1_000,
    120_000,
    issues,
  );
  const maxRequestsPerSocket = integer(
    env.AGENTOPS_HTTP_MAX_REQUESTS_PER_SOCKET ?? '1000',
    'AGENTOPS_HTTP_MAX_REQUESTS_PER_SOCKET',
    1,
    100_000,
    issues,
  );

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return {
    host: env.HOST?.trim() || '0.0.0.0',
    port,
    databaseUrl,
    redisUrl,
    requiredMigration,
    dedupeTtlSeconds,
    shutdownTimeoutMs,
    buildVersion: env.AGENTOPS_BUILD_VERSION?.trim() || 'dev',
    logLevel: env.LOG_LEVEL?.trim() || 'info',
    masterKey,
    masterKeyId: env.AGENTOPS_MASTER_KEY_ID?.trim() || 'local-v1',
    providerBaseUrls,
    modelPricing,
    pipelineDeadlineMs,
    approvalTtlMs,
    operatorAuth: {
      issuer: operatorIssuer.replace(/\/+$/, ''),
      clientId: operatorClientId,
      clientSecret: operatorClientSecret,
      callbackUri: operatorCallbackUri,
      roleClaim: env.AGENTOPS_OIDC_ROLE_CLAIM?.trim() || 'agentops_roles',
      tenantClaim:
        env.AGENTOPS_OIDC_TENANT_CLAIM?.trim() || 'agentops_tenants',
      operatorRole: env.AGENTOPS_OIDC_OPERATOR_ROLE?.trim() || 'operator',
      adminRole: env.AGENTOPS_OIDC_ADMIN_ROLE?.trim() || 'admin',
      sessionKeys: operatorSessionKeys,
      sessionTtlSeconds: operatorSessionTtlSeconds,
      secureCookie,
    },
    transport: {
      bodyLimitBytes,
      requestTimeoutMs,
      connectionTimeoutMs,
      keepAliveTimeoutMs,
      maxRequestsPerSocket,
    },
  };
}

function secretValue(
  direct: string | undefined,
  file: string | undefined,
  name: string,
  issues: string[],
): string | undefined {
  if (direct?.trim()) return direct;
  const path = file?.trim();
  if (!path) return undefined;
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    issues.push(`${name}_FILE:unreadable`);
    return undefined;
  }
}

function requiredMasterKey(
  value: string | undefined,
  name: string,
  issues: string[],
): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) {
    issues.push(`${name}:required`);
    return '';
  }
  try {
    const key = parseMasterKey(normalized);
    key.fill(0);
    return normalized;
  } catch {
    issues.push(`${name}:invalid`);
    return '';
  }
}

function requiredUrl(
  value: string | undefined,
  name: string,
  issues: string[],
): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) {
    issues.push(`${name}:required`);
    return '';
  }

  try {
    new URL(normalized);
  } catch {
    issues.push(`${name}:invalid_url`);
  }
  return normalized;
}

function requiredString(
  value: string | undefined,
  name: string,
  issues: string[],
): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) {
    issues.push(`${name}:required`);
  }
  return normalized;
}

function sessionKeys(
  value: string | undefined,
  issues: string[],
): readonly Buffer[] {
  const paths = value?.split(',').map((path) => path.trim()).filter(Boolean) ?? [];
  if (paths.length === 0) {
    issues.push('AGENTOPS_OPERATOR_SESSION_KEY_FILES:required');
    return [];
  }
  const keys: Buffer[] = [];
  for (const path of paths) {
    try {
      const key = readFileSync(path);
      if (key.length !== 32) {
        issues.push('AGENTOPS_OPERATOR_SESSION_KEY_FILES:invalid_key_length');
      } else {
        keys.push(key);
      }
    } catch {
      issues.push('AGENTOPS_OPERATOR_SESSION_KEY_FILES:unreadable');
    }
  }
  return keys;
}

function boolean(
  value: string,
  name: string,
  issues: string[],
): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  issues.push(`${name}:invalid_boolean`);
  return true;
}

function integer(
  value: string,
  name: string,
  minimum: number,
  maximum: number,
  issues: string[],
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push(`${name}:out_of_range`);
    return minimum;
  }
  return parsed;
}

function jsonRecord<T>(
  value: string | undefined,
  name: string,
  issues: string[],
  validate: (value: unknown) => T | null,
): Readonly<Record<string, T>> {
  if (value === undefined || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      issues.push(`${name}:invalid_json_object`);
      return {};
    }
    const result: Record<string, T> = {};
    for (const [key, nested] of Object.entries(parsed)) {
      const normalized = validate(nested);
      if (key.trim().length === 0 || normalized === null) {
        issues.push(`${name}:invalid_entry`);
        return {};
      }
      result[key.trim()] = normalized;
    }
    return result;
  } catch {
    issues.push(`${name}:invalid_json`);
    return {};
  }
}

function validateUrlValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? value.replace(/\/+$/, '')
      : null;
  } catch {
    return null;
  }
}

function validatePricingValue(
  value: unknown,
): { inputCostPerMillion: number; outputCostPerMillion: number } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const input = Reflect.get(value, 'inputCostPerMillion');
  const output = Reflect.get(value, 'outputCostPerMillion');
  return typeof input === 'number' &&
    Number.isFinite(input) &&
    input >= 0 &&
    typeof output === 'number' &&
    Number.isFinite(output) &&
    output >= 0
    ? { inputCostPerMillion: input, outputCostPerMillion: output }
    : null;
}
