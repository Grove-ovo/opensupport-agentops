import { createClient } from 'redis';
import type {
  OutboxRecord,
  StreamJob,
  StreamQueue,
} from './contracts.js';

type RedisClient = ReturnType<typeof createClient>;

const PUBLISH_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then
  return existing
end
local stream_id = redis.call('XADD', KEYS[2], '*', unpack(ARGV))
redis.call('SET', KEYS[1], stream_id)
return stream_id
`;

export class RedisStreamQueue implements StreamQueue {
  private constructor(
    readonly client: RedisClient,
    readonly streamKey: string,
    readonly groupName: string,
    readonly deadLetterStream: string,
  ) {}

  static async connect(
    url: string,
    streamKey: string,
    groupName: string,
    deadLetterStream: string,
  ): Promise<RedisStreamQueue> {
    const client = createClient({ url });
    client.on('error', () => {
      // Readiness and metrics expose dependency state.
    });
    await client.connect();
    return new RedisStreamQueue(
      client,
      streamKey,
      groupName,
      deadLetterStream,
    );
  }

  async ping(): Promise<void> {
    if ((await this.client.ping()) !== 'PONG') throw new Error('redis_ping_failed');
  }

  async ensureGroup(): Promise<void> {
    try {
      await this.client.sendCommand([
        'XGROUP',
        'CREATE',
        this.streamKey,
        this.groupName,
        '0',
        'MKSTREAM',
      ]);
    } catch (error) {
      if (!String(error).includes('BUSYGROUP')) throw error;
    }
  }

  async publish(record: OutboxRecord): Promise<string> {
    return this.publishOnce(
      this.streamKey,
      `agentops:stream-published:${record.dedupe_key}`,
      fields(record, 1),
    );
  }

  async read(
    consumer: string,
    count: number,
    blockMs: number,
  ): Promise<readonly StreamJob[]> {
    const response = await this.client.sendCommand([
      'XREADGROUP',
      'GROUP',
      this.groupName,
      consumer,
      'COUNT',
      String(count),
      'BLOCK',
      String(blockMs),
      'STREAMS',
      this.streamKey,
      '>',
    ]);
    return parseReadResponse(response);
  }

  async reclaim(
    consumer: string,
    minIdleMs: number,
    count: number,
  ): Promise<readonly StreamJob[]> {
    const response = await this.client.sendCommand([
      'XAUTOCLAIM',
      this.streamKey,
      this.groupName,
      consumer,
      String(minIdleMs),
      '0-0',
      'COUNT',
      String(count),
    ]);
    const value = response as unknown;
    if (!Array.isArray(value) || !Array.isArray(value[1])) return [];
    return parseEntries(value[1]);
  }

  async retry(job: StreamJob, errorCode: string): Promise<string> {
    return this.publishOnce(
      this.streamKey,
      `agentops:stream-retry:${job.outbox_id}:${job.attempt + 1}`,
      [...fields(job, job.attempt + 1), 'last_error_code', errorCode],
    );
  }

  async deadLetter(job: StreamJob, errorCode: string): Promise<string> {
    return this.publishOnce(
      this.deadLetterStream,
      `agentops:stream-dead:${job.outbox_id}`,
      [
        ...fields(job, job.attempt),
        'last_error_code',
        errorCode,
        'failed_stream_id',
        job.stream_id,
      ],
    );
  }

  async ack(streamId: string): Promise<void> {
    await this.client.sendCommand([
      'XACK',
      this.streamKey,
      this.groupName,
      streamId,
    ]);
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  private async publishOnce(
    stream: string,
    markerKey: string,
    values: readonly string[],
  ): Promise<string> {
    const result = await this.client.eval(PUBLISH_SCRIPT, {
      keys: [markerKey, stream],
      arguments: [...values],
    });
    return String(result);
  }
}

function fields(record: OutboxRecord, attempt: number): string[] {
  return [
    'outbox_id',
    record.outbox_id,
    'tenant_id',
    record.tenant_id ?? '',
    'job_type',
    record.job_type,
    'aggregate_type',
    record.aggregate_type,
    'aggregate_id',
    record.aggregate_id,
    'dedupe_key',
    record.dedupe_key,
    'attempt',
    String(attempt),
  ];
}

function parseReadResponse(value: unknown): StreamJob[] {
  if (!Array.isArray(value) || !Array.isArray(value[0])) return [];
  const stream = value[0] as unknown[];
  return Array.isArray(stream[1]) ? parseEntries(stream[1]) : [];
}

function parseEntries(value: unknown[]): StreamJob[] {
  const jobs: StreamJob[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || !Array.isArray(entry[1])) continue;
    const data = record(entry[1]);
    const jobType = data.job_type;
    if (
      jobType !== 'monitor_trace' &&
      jobType !== 'materialize_eval' &&
      jobType !== 'aggregate_dashboard'
    ) {
      continue;
    }
    jobs.push({
      stream_id: String(entry[0]),
      outbox_id: data.outbox_id ?? '',
      tenant_id: data.tenant_id || null,
      job_type: jobType,
      aggregate_type: data.aggregate_type ?? '',
      aggregate_id: data.aggregate_id ?? '',
      dedupe_key: data.dedupe_key ?? '',
      attempt: Math.max(1, Number(data.attempt ?? 1)),
    });
  }
  return jobs;
}

function record(values: unknown[]): Record<string, string> {
  const output: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    output[String(values[index])] = String(values[index + 1] ?? '');
  }
  return output;
}
