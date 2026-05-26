import { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { redactForLog, securityLog } from '../security/logRedaction';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IGNORED_PREFIXES = [
  '/health',
  '/admin/health',
  '/metrics',
  '/uploads',
  '/payments/midtrans/notification',
  '/webhooks/courier-payout-provider',
];

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

const routeFamily = (path: string) => {
  const normalizedPath = path.split('?')[0] || '/';
  return normalizedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => (UUID_PATTERN.test(segment) ? ':id' : segment))
    .join('.');
};

const bodyShape = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return Object.keys(body as Record<string, unknown>).sort();
};

export const shouldAuditRequest = (req: Request, res: Response) => {
  if (process.env.AUDIT_TRAIL_HTTP_MUTATIONS === 'false') return false;
  if (!MUTATING_METHODS.has(req.method)) return false;
  if (res.statusCode >= 400) return false;
  if (!isUuid(req.user?.id)) return false;

  const path = req.originalUrl || req.url || '';
  return !IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix));
};

export const buildHttpAuditPayload = (req: Request, res: Response) => ({
  request_id: res.locals.requestId || null,
  correlation_id: res.locals.correlationId || null,
  method: req.method,
  path: req.originalUrl || req.url,
  status_code: res.statusCode,
  actor_role: req.user?.role || null,
  ip_address: req.ip || req.socket?.remoteAddress || null,
  user_agent: req.headers['user-agent'] || null,
  request_body_keys: bodyShape(req.body),
  query_keys: Object.keys(req.query || {}).sort(),
});

export const resolveAuditTargetId = (req: Request) => {
  const candidates = [
    req.params?.id,
    req.params?.orderId,
    req.params?.customerId,
    req.params?.courierId,
    req.body?.id,
    req.body?.order_id,
    req.body?.orderId,
    req.body?.user_id,
    req.body?.userId,
  ];
  return candidates.find(isUuid) || null;
};

export const buildAuditAction = (req: Request) =>
  `http.${req.method.toLowerCase()}.${routeFamily(req.path || req.originalUrl || req.url)}`;

export const httpMutationAuditTrail = (req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => {
    if (!shouldAuditRequest(req, res)) return;

    const payload = buildHttpAuditPayload(req, res);
    db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        req.user?.id,
        buildAuditAction(req),
        resolveAuditTargetId(req),
        JSON.stringify(redactForLog(payload)),
      ]
    ).catch((error) => {
      securityLog.error('Failed to write HTTP mutation audit trail', {
        correlation_id: res.locals.correlationId,
        request_id: res.locals.requestId,
        action: buildAuditAction(req),
        error,
      });
    });
  });

  next();
};
