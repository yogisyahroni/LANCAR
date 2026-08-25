export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  resetTimeoutMs?: number;
}

export const DEFAULT_BREAKER_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30_000,
};

export class CircuitOpenError extends Error {
  readonly name = 'CircuitOpenError';
  constructor(public readonly key: string) {
    super(`circuit breaker "${key}" is open`);
  }
}

class Breaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private openedAt = 0;

  constructor(
    public readonly key: string,
    private readonly opts: Required<CircuitBreakerOptions>,
  ) {}

  getState(): CircuitState {
    this.refreshHalfOpen();
    return this.state;
  }

  allow(): void {
    this.refreshHalfOpen();
    if (this.state === 'open') {
      throw new CircuitOpenError(this.key);
    }
  }

  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.successes += 1;
      if (this.successes >= this.opts.successThreshold) {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
      }
      return;
    }
    if (this.state === 'closed') {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    if (this.state === 'half_open') {
      this.trip();
      return;
    }
    if (this.state === 'closed') {
      this.failures += 1;
      if (this.failures >= this.opts.failureThreshold) {
        this.trip();
      }
    }
  }

  private trip(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.successes = 0;
  }

  private refreshHalfOpen(): void {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.opts.resetTimeoutMs) {
      this.state = 'half_open';
      this.successes = 0;
    }
  }
}

const breakers = new Map<string, Breaker>();

export function getCircuitBreaker(
  key: string,
  options?: CircuitBreakerOptions,
): Breaker {
  let breaker = breakers.get(key);
  if (!breaker) {
    breaker = new Breaker(key, { ...DEFAULT_BREAKER_OPTIONS, ...options });
    breakers.set(key, breaker);
  }
  return breaker;
}

export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  options?: CircuitBreakerOptions,
): Promise<T> {
  const breaker = getCircuitBreaker(key, options);
  breaker.allow();
  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (err) {
    breaker.recordFailure();
    throw err;
  }
}
