import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const headerValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incomingCorrelationId = headerValue(req.headers['x-correlation-id']);
  const incomingRequestId = headerValue(req.headers['x-request-id']);
  const correlationId = incomingCorrelationId?.trim() || randomUUID();
  const requestId = incomingRequestId?.trim() || randomUUID();

  res.setHeader('X-Correlation-Id', correlationId);
  res.setHeader('X-Request-Id', requestId);
  res.locals.correlationId = correlationId;
  res.locals.requestId = requestId;
  next();
};
