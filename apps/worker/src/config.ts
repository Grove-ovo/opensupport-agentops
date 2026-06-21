export interface WorkerConfig {
  databaseUrl: string;
  redisUrl: string;
  host: string;
  port: number;
  streamKey: string;
  groupName: string;
  deadLetterStream: string;
  consumerName: string;
  requiredMigration: number;
  maxAttempts: number;
  visibilityTimeoutMs: number;
  relayIntervalMs: number;
  readBlockMs: number;
  batchSize: number;
  shutdownTimeoutMs: number;
  buildVersion: string;
}

export class WorkerConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid worker configuration: ${issues.join(', ')}`);
    this.name = 'WorkerConfigError';
  }
}

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const issues: string[] = [];
  const databaseUrl = url(env.DATABASE_URL, 'DATABASE_URL', issues);
  const redisUrl = url(env.REDIS_URL, 'REDIS_URL', issues);
  const config = {
    databaseUrl,
    redisUrl,
    host: env.AGENTOPS_WORKER_HOST?.trim() || '0.0.0.0',
    port: integer(env.AGENTOPS_WORKER_PORT ?? '8081', 'AGENTOPS_WORKER_PORT', 1, 65_535, issues),
    streamKey: token(env.AGENTOPS_STREAM_KEY ?? 'agentops:jobs', 'AGENTOPS_STREAM_KEY', issues),
    groupName: token(env.AGENTOPS_STREAM_GROUP ?? 'agentops-workers', 'AGENTOPS_STREAM_GROUP', issues),
    deadLetterStream: token(env.AGENTOPS_DEAD_LETTER_STREAM ?? 'agentops:jobs:dead', 'AGENTOPS_DEAD_LETTER_STREAM', issues),
    consumerName: token(env.AGENTOPS_WORKER_CONSUMER ?? `worker-${process.pid}`, 'AGENTOPS_WORKER_CONSUMER', issues),
    requiredMigration: integer(env.AGENTOPS_REQUIRED_MIGRATION ?? '16', 'AGENTOPS_REQUIRED_MIGRATION', 1, 10_000, issues),
    maxAttempts: integer(env.AGENTOPS_WORKER_MAX_ATTEMPTS ?? '3', 'AGENTOPS_WORKER_MAX_ATTEMPTS', 1, 20, issues),
    visibilityTimeoutMs: integer(env.AGENTOPS_WORKER_VISIBILITY_TIMEOUT_MS ?? '30000', 'AGENTOPS_WORKER_VISIBILITY_TIMEOUT_MS', 1_000, 3_600_000, issues),
    relayIntervalMs: integer(env.AGENTOPS_WORKER_RELAY_INTERVAL_MS ?? '500', 'AGENTOPS_WORKER_RELAY_INTERVAL_MS', 50, 60_000, issues),
    readBlockMs: integer(env.AGENTOPS_WORKER_READ_BLOCK_MS ?? '1000', 'AGENTOPS_WORKER_READ_BLOCK_MS', 10, 30_000, issues),
    batchSize: integer(env.AGENTOPS_WORKER_BATCH_SIZE ?? '25', 'AGENTOPS_WORKER_BATCH_SIZE', 1, 500, issues),
    shutdownTimeoutMs: integer(env.AGENTOPS_SHUTDOWN_TIMEOUT_MS ?? '10000', 'AGENTOPS_SHUTDOWN_TIMEOUT_MS', 1_000, 120_000, issues),
    buildVersion: env.AGENTOPS_BUILD_VERSION?.trim() || 'dev',
  };
  if (issues.length > 0) throw new WorkerConfigError(issues);
  return config;
}

function url(value: string | undefined, name: string, issues: string[]) {
  const normalized = value?.trim() ?? '';
  try {
    if (!normalized) throw new Error();
    new URL(normalized);
  } catch {
    issues.push(`${name}:${normalized ? 'invalid_url' : 'required'}`);
  }
  return normalized;
}

function integer(
  raw: string,
  name: string,
  min: number,
  max: number,
  issues: string[],
) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    issues.push(`${name}:invalid`);
  }
  return value;
}

function token(value: string, name: string, issues: string[]) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(normalized)) {
    issues.push(`${name}:invalid`);
  }
  return normalized;
}
