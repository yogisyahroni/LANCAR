import { CircuitOpenError } from './circuitBreaker';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  shouldRetry?: (err: unknown) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry'>> = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 3_000,
  multiplier: 2.0,
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const defaultShouldRetry = (): boolean => true;

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}

/**
 * Executes fn with exponential backoff. Retries only while shouldRetry(err)
 * returns true; abort errors are never retried unless explicitly allowed via
 * a custom shouldRetry. The last attempt's error is rethrown on exhaustion.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const maxAttempts = Math.max(1, opts.maxAttempts);
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let delay = opts.baseDelayMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const retryable =
        !(err instanceof CircuitOpenError) &&
        !isAbortError(err) &&
        shouldRetry(err);
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
    }
    await sleep(delay);
    delay = Math.min(delay * opts.multiplier, opts.maxDelayMs);
  }
  throw lastError;
}
