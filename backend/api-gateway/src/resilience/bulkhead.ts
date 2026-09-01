/**
 * Small, dependency-free concurrency guard for an upstream service.
 *
 * Proxy middleware is callback-based, so an immediate tryAcquire/release pair
 * is safer here than queueing requests indefinitely. Requests above the
 * configured limit fail fast with a controlled 503 at the gateway boundary.
 */
export class Bulkhead {
  private active = 0;

  constructor(public readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Bulkhead limit must be a positive integer');
    }
  }

  tryAcquire(): boolean {
    if (this.active >= this.limit) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    if (this.active > 0) this.active -= 1;
  }

  get activeRequests(): number {
    return this.active;
  }
}

export const resolveBulkheadLimit = (serviceName: string, fallback = 100): number => {
  const envKey = `${serviceName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_BULKHEAD_LIMIT`;
  const raw = process.env[envKey] || process.env.UPSTREAM_BULKHEAD_LIMIT;
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
