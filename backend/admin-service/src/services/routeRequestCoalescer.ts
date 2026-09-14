/**
 * Coalesces concurrent requests for the same authoritative route snapshot.
 *
 * Redis remains the cross-instance cache and this small in-process guard only
 * prevents a cache miss from fanning out into duplicate provider calls on one
 * admin-service instance. Failed requests are removed immediately so a later
 * request can retry normally.
 */
export class AsyncRequestCoalescer<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  async run(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const request = Promise.resolve().then(factory);
    this.inFlight.set(key, request);

    try {
      return await request;
    } finally {
      if (this.inFlight.get(key) === request) {
        this.inFlight.delete(key);
      }
    }
  }
}
