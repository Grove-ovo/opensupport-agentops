import type {
  JobRepository,
  StreamJob,
  StreamQueue,
  WorkerMetrics,
} from './contracts.js';
import type { WorkerConfig } from './config.js';

export class AsyncMonitorWorker {
  private initialized = false;
  private stopping = false;

  constructor(
    readonly repository: JobRepository,
    readonly queue: StreamQueue,
    readonly metrics: WorkerMetrics,
    readonly config: WorkerConfig,
  ) {
    metrics.gauge('agentops_worker_info', 1, {
      version: config.buildVersion,
    });
  }

  async initialize(): Promise<void> {
    await this.queue.ensureGroup();
    this.initialized = true;
  }

  async ready(): Promise<{
    postgres: boolean;
    redis: boolean;
    migration: number;
    required_migration: number;
    consumer_group: boolean;
  }> {
    let postgres = false;
    let redis = false;
    let migration = 0;
    try {
      await this.repository.ping();
      postgres = true;
      migration = await this.repository.migrationVersion();
    } catch {
      postgres = false;
    }
    try {
      await this.queue.ping();
      redis = true;
    } catch {
      redis = false;
    }
    this.metrics.gauge('agentops_worker_dependency_ready', postgres ? 1 : 0, {
      dependency: 'postgres',
    });
    this.metrics.gauge('agentops_worker_dependency_ready', redis ? 1 : 0, {
      dependency: 'redis',
    });
    return {
      postgres,
      redis,
      migration,
      required_migration: this.config.requiredMigration,
      consumer_group: this.initialized,
    };
  }

  async run(signal: AbortSignal): Promise<void> {
    if (!this.initialized) await this.initialize();
    while (!signal.aborted && !this.stopping) {
      await this.runOnce();
      if (!signal.aborted && !this.stopping) {
        await wait(this.config.relayIntervalMs, signal);
      }
    }
  }

  async runOnce(): Promise<void> {
    await this.relayOutbox();
    const reclaimed = await this.queue.reclaim(
      this.config.consumerName,
      this.config.visibilityTimeoutMs,
      this.config.batchSize,
    );
    const incoming = await this.queue.read(
      this.config.consumerName,
      this.config.batchSize,
      this.config.readBlockMs,
    );
    for (const job of dedupeJobs([...reclaimed, ...incoming])) {
      await this.process(job);
    }
  }

  stop(): void {
    this.stopping = true;
  }

  private async relayOutbox(): Promise<void> {
    const records = await this.repository.listPendingOutbox(
      this.config.batchSize,
    );
    this.metrics.gauge('agentops_worker_outbox_batch', records.length);
    for (const record of records) {
      try {
        const streamId = await this.queue.publish(record);
        await this.repository.markOutboxPublished(record.outbox_id, streamId);
        this.metrics.increment('agentops_worker_outbox_published_total', {
          job_type: record.job_type,
        });
      } catch (error) {
        await this.repository.markOutboxFailure(
          record.outbox_id,
          stableErrorCode(error),
        );
        this.metrics.increment('agentops_worker_outbox_failures_total', {
          job_type: record.job_type,
        });
      }
    }
  }

  private async process(job: StreamJob): Promise<void> {
    const claim = await this.repository.claimJob(
      job,
      this.config.consumerName,
      this.config.visibilityTimeoutMs,
    );
    if (claim === 'succeeded') {
      await this.queue.ack(job.stream_id);
      this.metrics.increment('agentops_worker_duplicate_total', {
        job_type: job.job_type,
      });
      return;
    }
    if (claim === 'dead_letter') {
      await this.queue.deadLetter(job, 'previously_dead_lettered');
      await this.queue.ack(job.stream_id);
      return;
    }
    if (claim === 'busy') {
      return;
    }
    try {
      await this.repository.executeJob(job);
      await this.queue.ack(job.stream_id);
      this.metrics.increment('agentops_worker_jobs_completed_total', {
        job_type: job.job_type,
      });
    } catch (error) {
      const code = stableErrorCode(error);
      const exhausted = job.attempt >= this.config.maxAttempts;
      await this.repository.markJobFailure(job, code, exhausted);
      if (exhausted) {
        await this.queue.deadLetter(job, code);
        this.metrics.increment('agentops_worker_dead_letter_total', {
          job_type: job.job_type,
          error_code: code,
        });
      } else {
        await this.queue.retry(job, code);
        this.metrics.increment('agentops_worker_retries_total', {
          job_type: job.job_type,
          error_code: code,
        });
      }
      await this.queue.ack(job.stream_id);
    }
  }
}

function dedupeJobs(jobs: readonly StreamJob[]): StreamJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.stream_id)) return false;
    seen.add(job.stream_id);
    return true;
  });
}

function stableErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : 'worker_error';
  const normalized = message
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._:-]+/gu, '_')
    .slice(0, 128);
  return normalized || 'worker_error';
}

async function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
