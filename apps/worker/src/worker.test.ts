import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  JobClaim,
  JobRepository,
  OutboxRecord,
  StreamJob,
  StreamQueue,
} from './contracts.js';
import { loadWorkerConfig, WorkerConfigError } from './config.js';
import { MetricsRegistry } from './metrics.js';
import { AsyncMonitorWorker } from './worker.js';

const config = loadWorkerConfig({
  DATABASE_URL: 'postgresql://agentops:agentops@localhost:5432/agentops',
  REDIS_URL: 'redis://localhost:6379/0',
  AGENTOPS_WORKER_CONSUMER: 'test-consumer',
  AGENTOPS_WORKER_RELAY_INTERVAL_MS: '50',
  AGENTOPS_WORKER_READ_BLOCK_MS: '10',
  AGENTOPS_WORKER_VISIBILITY_TIMEOUT_MS: '1000',
});

test('configuration validates dependency URLs and retry bounds', () => {
  assert.throws(
    () =>
      loadWorkerConfig({
        DATABASE_URL: 'invalid',
        REDIS_URL: '',
        AGENTOPS_WORKER_MAX_ATTEMPTS: '0',
      }),
    (error: unknown) =>
      error instanceof WorkerConfigError &&
      error.issues.includes('DATABASE_URL:invalid_url') &&
      error.issues.includes('REDIS_URL:required') &&
      error.issues.includes('AGENTOPS_WORKER_MAX_ATTEMPTS:invalid'),
  );
});

test('relays outbox and acknowledges only after durable execution', async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  repository.outbox.push(outbox('monitor_trace'));
  const worker = new AsyncMonitorWorker(
    repository,
    queue,
    new MetricsRegistry(),
    config,
  );
  await worker.initialize();
  await worker.runOnce();
  assert.deepEqual(repository.events, [
    'published:00000000-0000-4000-8000-000000000001',
    'claim:00000000-0000-4000-8000-000000000001',
    'execute:00000000-0000-4000-8000-000000000001',
  ]);
  assert.deepEqual(queue.acked, ['1-0']);
});

test('retries failures and dead-letters exhausted poison jobs', async () => {
  const repository = new FakeRepository();
  repository.failExecution = true;
  const queue = new FakeQueue();
  queue.incoming.push(streamJob(1));
  const worker = new AsyncMonitorWorker(
    repository,
    queue,
    new MetricsRegistry(),
    { ...config, maxAttempts: 2 },
  );
  await worker.initialize();
  await worker.runOnce();
  assert.equal(queue.retried.length, 1);
  assert.equal(repository.failures[0]?.deadLetter, false);

  queue.incoming.push(streamJob(2, '2-0'));
  await worker.runOnce();
  assert.equal(queue.dead.length, 1);
  assert.equal(repository.failures[1]?.deadLetter, true);
  assert.deepEqual(queue.acked, ['1-0', '2-0']);
});

test('run exits after abort without claiming more jobs', async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const worker = new AsyncMonitorWorker(
    repository,
    queue,
    new MetricsRegistry(),
    config,
  );
  const controller = new AbortController();
  const running = worker.run(controller.signal);
  setTimeout(() => controller.abort(), 15);
  await running;
  assert.equal(queue.groupCreated, true);
});

test('readiness and metrics expose worker dependency state', async () => {
  const metrics = new MetricsRegistry();
  const worker = new AsyncMonitorWorker(
    new FakeRepository(),
    new FakeQueue(),
    metrics,
    config,
  );
  await worker.initialize();
  assert.deepEqual(await worker.ready(), {
    postgres: true,
    redis: true,
    migration: 16,
    required_migration: 16,
    consumer_group: true,
  });
  assert.match(metrics.render(), /agentops_worker_dependency_ready/);
});

class FakeRepository implements JobRepository {
  outbox: OutboxRecord[] = [];
  events: string[] = [];
  failures: Array<{ code: string; deadLetter: boolean }> = [];
  failExecution = false;

  async ping(): Promise<void> {}
  async migrationVersion(): Promise<number> {
    return 16;
  }
  async listPendingOutbox(): Promise<readonly OutboxRecord[]> {
    return this.outbox.splice(0);
  }
  async markOutboxPublished(outboxId: string): Promise<void> {
    this.events.push(`published:${outboxId}`);
  }
  async markOutboxFailure(): Promise<void> {}
  async claimJob(job: StreamJob): Promise<JobClaim> {
    this.events.push(`claim:${job.outbox_id}`);
    return 'claimed';
  }
  async executeJob(job: StreamJob): Promise<void> {
    this.events.push(`execute:${job.outbox_id}`);
    if (this.failExecution) throw new Error('poison_job');
  }
  async markJobFailure(
    _job: StreamJob,
    code: string,
    deadLetter: boolean,
  ): Promise<void> {
    this.failures.push({ code, deadLetter });
  }
  async close(): Promise<void> {}
}

class FakeQueue implements StreamQueue {
  incoming: StreamJob[] = [];
  acked: string[] = [];
  retried: StreamJob[] = [];
  dead: StreamJob[] = [];
  groupCreated = false;

  async ping(): Promise<void> {}
  async ensureGroup(): Promise<void> {
    this.groupCreated = true;
  }
  async publish(record: OutboxRecord): Promise<string> {
    this.incoming.push({ ...record, stream_id: '1-0', attempt: 1 });
    return '1-0';
  }
  async read(): Promise<readonly StreamJob[]> {
    return this.incoming.splice(0);
  }
  async reclaim(): Promise<readonly StreamJob[]> {
    return [];
  }
  async retry(job: StreamJob): Promise<string> {
    this.retried.push(job);
    return 'retry-1';
  }
  async deadLetter(job: StreamJob): Promise<string> {
    this.dead.push(job);
    return 'dead-1';
  }
  async ack(streamId: string): Promise<void> {
    this.acked.push(streamId);
  }
  async close(): Promise<void> {}
}

function outbox(jobType: OutboxRecord['job_type']): OutboxRecord {
  return {
    outbox_id: '00000000-0000-4000-8000-000000000001',
    tenant_id: '00000000-0000-4000-8000-000000000002',
    job_type: jobType,
    aggregate_type: 'runtime_execution',
    aggregate_id: '00000000-0000-4000-8000-000000000003',
    dedupe_key: 'test-job',
  };
}

function streamJob(attempt: number, streamId = '1-0'): StreamJob {
  return { ...outbox('monitor_trace'), stream_id: streamId, attempt };
}
