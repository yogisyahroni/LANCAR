import { NextFunction, Request, RequestHandler, Response } from 'express';

export interface ProxyBreaker {
  opened: boolean;
  fire(reason: Error): Promise<unknown> | unknown;
}

export interface ProxyBulkhead {
  tryAcquire(): boolean;
  release(): void;
}

export interface DirectProxyPolicy {
  matches(path: string): boolean;
  serviceName: string;
  breaker: ProxyBreaker;
  bulkhead: ProxyBulkhead;
  /** Existing proxy callbacks already record failures themselves. */
  observeResponse: boolean;
}

type FailureRecorder = (breaker: ProxyBreaker, message: string) => void;

const unavailable = (serviceName: string, code: string, message: string) => ({
  status: 'error',
  error: {
    code,
    message: message || `Service ${serviceName} is currently unavailable`,
  },
});

/**
 * Adds bounded concurrency and circuit-open protection around legacy proxy
 * middleware. The wrapper owns exactly one bulkhead slot per request and
 * releases it on finish or abort. Downstream proxy error handlers still own
 * their response body/status, while this layer observes the final status.
 */
export const createDirectProxyResilienceMiddleware = (
  policies: DirectProxyPolicy[],
  recordFailure: FailureRecorder,
): RequestHandler => (req: Request, res: Response, next: NextFunction) => {
  const policy = policies.find((candidate) => candidate.matches(req.path));
  if (!policy) {
    next();
    return;
  }

  if (policy.breaker.opened) {
    res.status(503).json(unavailable(
      policy.serviceName,
      'ERR_CIRCUIT_OPEN',
      `${policy.serviceName} is currently unavailable (Circuit Breaker Open)`,
    ));
    return;
  }

  if (!policy.bulkhead.tryAcquire()) {
    res.status(503).json(unavailable(
      policy.serviceName,
      'ERR_BULKHEAD_FULL',
      `${policy.serviceName} is at capacity. Please retry shortly.`,
    ));
    return;
  }

  let released = false;
  let responseFinished = false;
  const release = () => {
    if (released) return;
    released = true;
    policy.bulkhead.release();
  };

  res.once('finish', () => {
    responseFinished = true;
    if (policy.observeResponse && res.statusCode >= 500) {
      recordFailure(policy.breaker, `upstream ${res.statusCode}`);
    }
    release();
  });
  res.once('close', () => {
    if (!responseFinished && policy.observeResponse) {
      recordFailure(policy.breaker, 'upstream proxy connection closed before response');
    }
    release();
  });

  next();
};
