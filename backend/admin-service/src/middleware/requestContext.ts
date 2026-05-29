import { randomBytes, randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express';
import { annotateActiveSpan, getActiveTraceContext } from '../tracing';

type RequestLogContext = {
  correlationId: string;
  requestId: string;
  traceId: string;
  spanId: string;
  traceparent: string;
};

const requestContextStore = new AsyncLocalStorage<RequestLogContext>();
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

const headerValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const safeRequestId = (value: string | undefined): string | undefined => {
  const candidate = value?.trim();
  if (!candidate || !SAFE_ID_PATTERN.test(candidate)) return undefined;
  return candidate;
};

const createTraceparent = () =>
  `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;

const traceparentFromActiveSpan = () => {
  const activeTrace = getActiveTraceContext();
  if (!activeTrace) return undefined;
  const traceFlags = activeTrace.traceFlags.toString(16).padStart(2, '0');
  return `00-${activeTrace.traceId}-${activeTrace.spanId}-${traceFlags}`;
};

const sanitizeTraceparent = (value: string | undefined): string | undefined => {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  const match = TRACEPARENT_PATTERN.exec(candidate);
  if (!match) return undefined;

  const [, traceId, spanId] = match;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return undefined;

  return candidate;
};

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incomingCorrelationId = headerValue(req.headers['x-correlation-id']);
  const incomingRequestId = headerValue(req.headers['x-request-id']);
  const requestId = safeRequestId(incomingRequestId) || randomUUID();
  const correlationId = safeRequestId(incomingCorrelationId) || requestId;
  const traceparent =
    traceparentFromActiveSpan() ||
    sanitizeTraceparent(headerValue(req.headers.traceparent)) ||
    createTraceparent();
  const traceId = traceparent.split('-')[1];
  const spanId = traceparent.split('-')[2];

  req.headers['x-correlation-id'] = correlationId;
  req.headers['x-request-id'] = requestId;
  req.headers.traceparent = traceparent;

  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Trace-ID', traceId);
  res.locals.correlationId = correlationId;
  res.locals.requestId = requestId;
  res.locals.traceId = traceId;
  res.locals.spanId = spanId;
  annotateActiveSpan({
    'request.id': requestId,
  });
  requestContextStore.run({ correlationId, requestId, traceId, spanId, traceparent }, next);
};

export const getCurrentRequestContext = () => requestContextStore.getStore();
