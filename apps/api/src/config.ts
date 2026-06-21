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
    env.AGENTOPS_REQUIRED_MIGRATION ?? '14',
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
  };
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
