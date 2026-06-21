import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import type { RedisCoordinator } from './contracts.js';

type NodeRedisClient = ReturnType<typeof createClient>;

const CLAIM_SCRIPT = `
for index, key in ipairs(KEYS) do
  if redis.call('EXISTS', key) == 1 then
    return 0
  end
end
for index, key in ipairs(KEYS) do
  redis.call('SET', key, ARGV[1], 'EX', ARGV[2])
end
return 1
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export class NodeRedisCoordinator implements RedisCoordinator {
  constructor(readonly client: NodeRedisClient) {}

  static async connect(url: string): Promise<NodeRedisCoordinator> {
    const client = createClient({ url });
    client.on('error', () => {
      // Connection state is exposed through readiness and structured API logs.
    });
    await client.connect();
    return new NodeRedisCoordinator(client);
  }

  async ping(): Promise<void> {
    const response = await this.client.ping();
    if (response !== 'PONG') {
      throw new Error('Redis ping failed');
    }
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async claimDedupeKeys(
    keys: readonly string[],
    ttlSeconds: number,
  ): Promise<boolean> {
    const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
    if (uniqueKeys.length === 0) {
      throw new TypeError('At least one dedupe key is required');
    }
    const result = await this.client.eval(CLAIM_SCRIPT, {
      keys: uniqueKeys.map((key) => `agentops:dedupe:${key}`),
      arguments: [randomUUID(), String(ttlSeconds)],
    });
    return Number(result) === 1;
  }

  async acquireLock(
    key: string,
    ttlMilliseconds: number,
  ): Promise<{ token: string; release(): Promise<boolean> } | null> {
    const token = randomUUID();
    const redisKey = `agentops:lock:${key}`;
    const result = await this.client.set(redisKey, token, {
      PX: ttlMilliseconds,
      NX: true,
    });
    if (result !== 'OK') {
      return null;
    }
    return {
      token,
      release: async () => {
        const released = await this.client.eval(RELEASE_SCRIPT, {
          keys: [redisKey],
          arguments: [token],
        });
        return Number(released) === 1;
      },
    };
  }
}
