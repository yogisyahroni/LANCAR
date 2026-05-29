import { NextFunction, Request, Response } from 'express';
import { redactForLog, securityLog } from '../security/logRedaction';

const DEFAULT_INTERNAL_ERROR = {
  statusCode: 500,
  code: 'ERR_INTERNAL_SERVER',
  message: 'Internal server error',
};

const RESPONSE_ALREADY_SANITIZED_KEY = 'tembusErrorResponseSanitized';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSafeInternalErrorEnvelope = (body: unknown) =>
  isObject(body) &&
  body.success === false &&
  body.error === DEFAULT_INTERNAL_ERROR.message &&
  body.message === DEFAULT_INTERNAL_ERROR.message &&
  body.code === DEFAULT_INTERNAL_ERROR.code;

const parseJsonString = (body: unknown) => {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
};

const shouldSanitizeResponse = (statusCode: number, body: unknown) => {
  if (statusCode < 500) return false;
  if (isSafeInternalErrorEnvelope(body)) return false;
  if (!isObject(body)) return true;
  return Boolean(body.error || body.message || body.stack || body.detail || body.details);
};

const buildSafeErrorEnvelope = (res: Response, statusCode = DEFAULT_INTERNAL_ERROR.statusCode) => ({
  success: false,
  error: DEFAULT_INTERNAL_ERROR.message,
  message: DEFAULT_INTERNAL_ERROR.message,
  code: DEFAULT_INTERNAL_ERROR.code,
  correlation_id: res.locals.correlationId,
  request_id: res.locals.requestId,
  trace_id: res.locals.traceId,
  status_code: statusCode,
});

const logUnsafeServerError = (req: Request, res: Response, body: unknown) => {
  securityLog.error('Sanitized unsafe server error response', {
    correlation_id: res.locals.correlationId,
    request_id: res.locals.requestId,
    method: req.method,
    path: req.originalUrl,
    status_code: res.statusCode,
    response_body: redactForLog(body),
  });
};

export const sanitizeErrorResponses = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = (body?: unknown): Response => {
    if (shouldSanitizeResponse(res.statusCode, body)) {
      logUnsafeServerError(req, res, body);
      res.locals[RESPONSE_ALREADY_SANITIZED_KEY] = true;
      try {
        return originalJson(buildSafeErrorEnvelope(res, res.statusCode));
      } finally {
        res.locals[RESPONSE_ALREADY_SANITIZED_KEY] = false;
      }
    }
    return originalJson(body);
  };

  res.send = (body?: unknown): Response => {
    if (res.locals[RESPONSE_ALREADY_SANITIZED_KEY]) return originalSend(body);

    if (res.statusCode >= 500) {
      if (isSafeInternalErrorEnvelope(parseJsonString(body))) return originalSend(body);

      logUnsafeServerError(req, res, body);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return originalSend(JSON.stringify(buildSafeErrorEnvelope(res, res.statusCode)));
    }
    return originalSend(body);
  };

  next();
};

export const genericErrorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  securityLog.error('Unhandled request error', {
    correlation_id: res.locals.correlationId,
    request_id: res.locals.requestId,
    method: req.method,
    path: req.originalUrl,
    error,
  });

  if (res.headersSent) return;
  res.status(DEFAULT_INTERNAL_ERROR.statusCode).json(buildSafeErrorEnvelope(res));
};
