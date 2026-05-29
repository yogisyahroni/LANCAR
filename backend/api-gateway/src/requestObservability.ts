import { randomBytes, randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { annotateActiveSpan, getActiveTraceContext } from './tracing';

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

type ObservabilityContext = {
  correlationId: string;
  requestId: string;
  traceparent: string;
  traceId: string;
  spanId: string;
};

const headerValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const safeRequestId = (value: string | undefined): string | undefined => {
  const candidate = value?.trim();
  if (!candidate || !SAFE_ID_PATTERN.test(candidate)) return undefined;
  return candidate;
};

const randomHex = (bytes: number) => randomBytes(bytes).toString('hex');

const createTraceparent = () => `00-${randomHex(16)}-${randomHex(8)}-01`;

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

export const traceIdFromTraceparent = (value: string | string[] | undefined) => {
  const traceparent = sanitizeTraceparent(headerValue(value));
  return traceparent?.split('-')[1];
};

export const spanIdFromTraceparent = (value: string | string[] | undefined) => {
  const traceparent = sanitizeTraceparent(headerValue(value));
  return traceparent?.split('-')[2];
};

const buildObservabilityContext = (req: Request): ObservabilityContext => {
  const requestId = safeRequestId(headerValue(req.headers['x-request-id'])) || randomUUID();
  const correlationId =
    safeRequestId(headerValue(req.headers['x-correlation-id'])) || requestId;
  const traceparent =
    traceparentFromActiveSpan() ||
    sanitizeTraceparent(headerValue(req.headers.traceparent)) ||
    createTraceparent();
  const traceId = traceparent.split('-')[1];
  const spanId = traceparent.split('-')[2];

  return {
    correlationId,
    requestId,
    traceparent,
    traceId,
    spanId,
  };
};

export const requestObservabilityMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const context = buildObservabilityContext(req);

  req.headers['x-correlation-id'] = context.correlationId;
  req.headers['x-request-id'] = context.requestId;
  req.headers.traceparent = context.traceparent;

  res.locals.correlationId = context.correlationId;
  res.locals.requestId = context.requestId;
  res.locals.traceId = context.traceId;
  res.locals.spanId = context.spanId;

  res.setHeader('X-Correlation-ID', context.correlationId);
  res.setHeader('X-Request-ID', context.requestId);
  res.setHeader('X-Trace-ID', context.traceId);
  annotateActiveSpan({
    'request.id': context.requestId,
  });

  next();
};

export const applyProxyObservabilityHeaders = (proxyReq: any, req: Request) => {
  const context = buildObservabilityContext(req);

  proxyReq.setHeader('X-Correlation-ID', context.correlationId);
  proxyReq.setHeader('X-Request-ID', context.requestId);
  proxyReq.setHeader('traceparent', context.traceparent);
  proxyReq.setHeader('X-Trace-ID', context.traceId);
};
