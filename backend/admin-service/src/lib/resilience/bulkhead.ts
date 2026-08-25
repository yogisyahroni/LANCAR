export interface BulkheadOptions {
  maxConcurrent?: number;
  queueTimeoutMs?: number;
}

export class BulkheadFullError extends Error {
  readonly name = 'BulkheadFullError';
  constructor(public readonly key: string) {
    super(`bulkhead "${key}" has no available capacity`);
  }
}

interface Lease {
  release(): void;
}

class Bulkhead {
  private slots: number;

  constructor(
    public readonly key: string,
    private readonly maxConcurrent: number,
    private readonly queueTimeoutMs: number,
  ) {
    this.slots = maxConcurrent;
  }

  get queued(): number {
    return this.maxConcurrent - this.slots;
  }

  async acquire(): Promise<Lease> {
    if (this.slots > 0) {
      this.slots -= 1;
      return { release: () => this.releaseSlot() };
    }
    if (this.queueTimeoutMs <= 0 || !Number.isFinite(this.queueTimeoutMs)) {
      throw new BulkheadFullError(this.key);
    }
    await this.waitForSlot();
    this.slots -= 1;
    return { release: () => this.releaseSlot() };
  }

  tryAcquire(): Lease | null {
    if (this.slots > 0) {
      this.slots -= 1;
      return { release: () => this.releaseSlot() };
    }
    return null;
  }

  private releaseSlot(): void {
    if (this.slots < this.maxConcurrent) {
      this.slots += 1;
    }
  }

  private waitForSlot(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const poll = () => {
        if (this.slots > 0) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - startedAt >= this.queueTimeoutMs) {
          clearInterval(timer);
          reject(new BulkheadFullError(this.key));
        }
      };
      const timer = setInterval(poll, 25);
    });
  }
}

const bulkheads = new Map<string, Bulkhead>();

export function getBulkhead(key: string, options?: BulkheadOptions): Bulkhead {
  let bulkhead = bulkheads.get(key);
  if (!bulkhead) {
    bulkhead = new Bulkhead(
      key,
      options?.maxConcurrent ?? 10,
      options?.queueTimeoutMs ?? 5_000,
    );
    bulkheads.set(key, bulkhead);
  }
  return bulkhead;
}

export async function withBulkhead<T>(
  key: string,
  fn: () => Promise<T>,
  options?: BulkheadOptions,
): Promise<T> {
  const lease = await getBulkhead(key, options).acquire();
  try {
    return await fn();
  } finally {
    lease.release();
  }
}
