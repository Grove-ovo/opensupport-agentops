export type AsyncJobType =
  | 'monitor_trace'
  | 'materialize_eval'
  | 'aggregate_dashboard';

export interface OutboxRecord {
  outbox_id: string;
  tenant_id: string | null;
  job_type: AsyncJobType;
  aggregate_type: string;
  aggregate_id: string;
  dedupe_key: string;
}

export interface StreamJob extends OutboxRecord {
  stream_id: string;
  attempt: number;
}

export type JobClaim = 'claimed' | 'succeeded' | 'dead_letter' | 'busy';

export interface JobRepository {
  ping(): Promise<void>;
  migrationVersion(): Promise<number>;
  listPendingOutbox(limit: number): Promise<readonly OutboxRecord[]>;
  markOutboxPublished(outboxId: string, streamId: string): Promise<void>;
  markOutboxFailure(outboxId: string, errorCode: string): Promise<void>;
  claimJob(
    job: StreamJob,
    consumerName: string,
    visibilityTimeoutMs: number,
  ): Promise<JobClaim>;
  executeJob(job: StreamJob): Promise<void>;
  markJobFailure(
    job: StreamJob,
    errorCode: string,
    deadLetter: boolean,
  ): Promise<void>;
  close(): Promise<void>;
}

export interface StreamQueue {
  ping(): Promise<void>;
  ensureGroup(): Promise<void>;
  publish(record: OutboxRecord): Promise<string>;
  read(consumer: string, count: number, blockMs: number): Promise<readonly StreamJob[]>;
  reclaim(
    consumer: string,
    minIdleMs: number,
    count: number,
  ): Promise<readonly StreamJob[]>;
  retry(job: StreamJob, errorCode: string): Promise<string>;
  deadLetter(job: StreamJob, errorCode: string): Promise<string>;
  ack(streamId: string): Promise<void>;
  close(): Promise<void>;
}

export interface WorkerMetrics {
  increment(name: string, labels?: Record<string, string>, value?: number): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  render(): string;
}
