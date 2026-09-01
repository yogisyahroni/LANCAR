import Redis from 'ioredis';
import type { IncrementResponse, Options, Store } from 'express-rate-limit';

const INCREMENT_SCRIPT = `
local total = redis.call('INCR', KEYS[1])
if total == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { total, ttl }
`;

const DECREMENT_SCRIPT = `
local total = redis.call('DECR', KEYS[1])
if total <= 0 then
  redis.call('DEL', KEYS[1])
end
return total
`;

type RedisRateLimitStoreOptions = {
  namespace: string;
  windowMs: number;
  redisUrl?: string;
};

type RedisStoreClient = Pick<Redis, 'connect' | 'disconnect' | 'eval' | 'get' | 'del'> & {
  status?: string;
};

const asNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  private readonly client: RedisStoreClient;
  private readonly keyPrefix: string;
  private windowMs: number;
  private connectPromise: Promise<unknown> | null = null;

  constructor(options: RedisRateLimitStoreOptions, client?: RedisStoreClient) {
    this.keyPrefix = `tembus:gateway:ratelimit:${options.namespace}:`;
    this.windowMs = options.windowMs;
    this.client = client || new Redis(options.redisUrl || process.env.REDIS_URL!, { lazyConnect: true });
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    await this.ensureConnected();
    const result = await this.client.eval(INCREMENT_SCRIPT, 1, this.redisKey(key), String(this.windowMs)) as unknown as [unknown, unknown];
    const ttlMs = Math.max(0, asNumber(result[1], this.windowMs));
    return {
      totalHits: Math.max(1, asNumber(result[0], 1)),
      resetTime: new Date(Date.now() + ttlMs),
    };
  }

  async get(key: string): Promise<IncrementResponse | undefined> {
    await this.ensureConnected();
    const redisKey = this.redisKey(key);
    const [total, ttl] = await Promise.all([
      this.client.get(redisKey),
      this.client.eval("return redis.call('PTTL', KEYS[1])", 1, redisKey),
    ]);
    if (total === null) return undefined;
    return {
      totalHits: Math.max(0, asNumber(total, 0)),
      resetTime: new Date(Date.now() + Math.max(0, asNumber(ttl, this.windowMs))),
    };
  }

  async decrement(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.eval(DECREMENT_SCRIPT, 1, this.redisKey(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(this.redisKey(key));
  }

  async shutdown(): Promise<void> {
    if (this.client.status !== 'wait') this.client.disconnect();
    this.connectPromise = null;
  }

  private redisKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === 'ready') return;
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().catch((error) => {
        this.connectPromise = null;
        throw error;
      });
    }
    await this.connectPromise;
  }
}

export const createRedisRateLimitStore = (
  namespace: string,
  windowMs: number,
): RedisRateLimitStore | undefined => {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return undefined;
  return new RedisRateLimitStore({ namespace, windowMs, redisUrl });
};

export const rateLimitStoreOptions = (namespace: string, windowMs: number) => {
  const store = createRedisRateLimitStore(namespace, windowMs);
  return store ? { store, passOnStoreError: false } : {};
};
