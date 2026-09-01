const assert = require('node:assert/strict');
const { RedisRateLimitStore } = require('../dist/redisRateLimitStore');

class FakeRedis {
  constructor() {
    this.status = 'wait';
    this.values = new Map();
    this.expiry = new Map();
    this.connects = 0;
  }

  async connect() {
    this.connects += 1;
    this.status = 'ready';
    return this;
  }

  disconnect() {
    this.status = 'end';
  }

  async get(key) {
    return this.values.has(key) ? String(this.values.get(key)) : null;
  }

  async del(key) {
    this.values.delete(key);
    this.expiry.delete(key);
  }

  async eval(script, _keyCount, key, windowMs) {
    if (script.includes('INCR')) {
      const total = (this.values.get(key) || 0) + 1;
      this.values.set(key, total);
      if (total === 1) this.expiry.set(key, Number(windowMs));
      return [total, this.expiry.get(key)];
    }
    if (script.includes('DECR')) {
      const total = (this.values.get(key) || 0) - 1;
      if (total <= 0) await this.del(key);
      else this.values.set(key, total);
      return total;
    }
    return this.expiry.get(key) ?? -2;
  }
}

(async () => {
  const client = new FakeRedis();
  const store = new RedisRateLimitStore({ namespace: 'test', windowMs: 60_000 }, client);

  assert.equal((await store.increment('ip-1')).totalHits, 1);
  assert.equal((await store.increment('ip-1')).totalHits, 2);
  assert.equal((await store.get('ip-1')).totalHits, 2);
  await store.decrement('ip-1');
  assert.equal((await store.get('ip-1')).totalHits, 1);
  await store.resetKey('ip-1');
  assert.equal(await store.get('ip-1'), undefined);
  assert.equal(client.connects, 1);
  await store.shutdown();
  assert.equal(client.status, 'end');
  console.log('redis rate-limit store tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
