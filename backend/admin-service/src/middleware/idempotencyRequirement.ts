import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { db } from '../db';

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const IDEMPOTENCY_LOCK_SECONDS = Number.parseInt(
  process.env.IDEMPOTENCY_LOCK_SECONDS || '120',
  10,
);

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
    role?: string;
    email?: string;
  };
};

type IdempotencyRow = {
  id: string;
  request_hash: string;
  response_hash: string | null;
  status_code: number | null;
  response_body: unknown | null;
  state: 'processing' | 'completed' | 'failed';
  locked_until: Date;
};

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const getHeader = (req: Request, name: string): string | undefined => {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
};

const stableJson = (value: unknown): string => {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const hashRequest = (req: Request) => {
  const payload = {
    method: req.method,
    path: req.originalUrl.split('?')[0],
    params: req.params,
    query: req.query,
    body: req.body ?? null,
  };
  return sha256(stableJson(payload));
};

const hashNullableHeader = (value?: string) => (value ? sha256(value) : null);

const resolveActor = (req: AuthenticatedRequest) => {
  const userId = req.user?.id;
  if (userId) {
    return {
      actorKey: userId,
      actorType: req.user?.role || 'authenticated_user',
    };
  }

  const forwardedFor = getHeader(req, 'x-forwarded-for');
  const ipSource = forwardedFor?.split(',')[0]?.trim() || req.ip || 'unknown';
  return {
    actorKey: `anonymous:${sha256(ipSource)}`,
    actorType: 'anonymous',
  };
};

const findExistingRequest = async (
  scope: string,
  actorKey: string,
  idempotencyKey: string,
) => {
  const { rows } = await db.query<IdempotencyRow>(
    `SELECT id,
            request_hash,
            response_hash,
            status_code,
            response_body,
            state,
            locked_until
       FROM api_idempotency_keys
      WHERE scope = $1
        AND actor_key = $2
        AND idempotency_key = $3
      LIMIT 1`,
    [scope, actorKey, idempotencyKey],
  );
  return rows[0] || null;
};

const acquireOrReplay = async (
  req: AuthenticatedRequest,
  res: Response,
  scope: string,
  idempotencyKey: string,
): Promise<{ proceed: boolean; idempotencyId?: string }> => {
  const requestHash = hashRequest(req);
  const { actorKey, actorType } = resolveActor(req);
  const deviceId =
    getHeader(req, 'x-device-id') ||
    getHeader(req, 'x-client-device-id') ||
    getHeader(req, 'x-installation-id') ||
    null;
  const forwardedFor = getHeader(req, 'x-forwarded-for');
  const ipSource = forwardedFor?.split(',')[0]?.trim() || req.ip || '';
  const userAgent = getHeader(req, 'user-agent');

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO api_idempotency_keys (
        scope,
        actor_key,
        actor_type,
        idempotency_key,
        request_hash,
        device_id,
        ip_hash,
        user_agent_hash,
        locked_until
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        NOW() + ($9::text || ' seconds')::interval
      )
      ON CONFLICT (scope, actor_key, idempotency_key) DO NOTHING
      RETURNING id`,
    [
      scope,
      actorKey,
      actorType,
      idempotencyKey,
      requestHash,
      deviceId,
      hashNullableHeader(ipSource),
      hashNullableHeader(userAgent),
      Number.isFinite(IDEMPOTENCY_LOCK_SECONDS) ? IDEMPOTENCY_LOCK_SECONDS : 120,
    ],
  );

  if (inserted.rows[0]?.id) {
    return { proceed: true, idempotencyId: inserted.rows[0].id };
  }

  const existing = await findExistingRequest(scope, actorKey, idempotencyKey);
  if (!existing) {
    res.status(409).json({
      status: 'error',
      code: 'IDEMPOTENCY_STATE_CONFLICT',
      message: 'Request idempotency sedang diproses. Coba ulang beberapa saat lagi.',
      request_id: res.locals.requestId,
      correlation_id: res.locals.correlationId,
    });
    return { proceed: false };
  }

  if (existing.request_hash !== requestHash) {
    res.status(409).json({
      status: 'error',
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      message: 'X-Idempotency-Key sudah pernah dipakai untuk payload berbeda.',
      request_id: res.locals.requestId,
      correlation_id: res.locals.correlationId,
    });
    return { proceed: false };
  }

  if (existing.state === 'completed' && existing.status_code && existing.response_body) {
    res.setHeader('X-Idempotency-Replayed', 'true');
    res.status(existing.status_code).json(existing.response_body);
    return { proceed: false };
  }

  if (existing.state === 'processing' && new Date(existing.locked_until).getTime() > Date.now()) {
    res.status(409).json({
      status: 'error',
      code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      message: 'Request yang sama masih diproses. Coba ulang sebentar lagi.',
      request_id: res.locals.requestId,
      correlation_id: res.locals.correlationId,
    });
    return { proceed: false };
  }

  await db.query(
    `UPDATE api_idempotency_keys
        SET state = 'processing',
            locked_until = NOW() + ($4::text || ' seconds')::interval,
            updated_at = NOW()
      WHERE scope = $1
        AND actor_key = $2
        AND idempotency_key = $3`,
    [
      scope,
      actorKey,
      idempotencyKey,
      Number.isFinite(IDEMPOTENCY_LOCK_SECONDS) ? IDEMPOTENCY_LOCK_SECONDS : 120,
    ],
  );

  return { proceed: true, idempotencyId: existing.id };
};

const persistResponse = async (
  idempotencyId: string,
  statusCode: number,
  body: unknown,
) => {
  const responseHash = sha256(stableJson(body ?? null));
  const state = statusCode >= 500 ? 'failed' : 'completed';
  await db.query(
    `UPDATE api_idempotency_keys
        SET state = $2,
            status_code = $3,
            response_body = $4::jsonb,
            response_hash = $5,
            updated_at = NOW()
      WHERE id = $1`,
    [idempotencyId, state, statusCode, JSON.stringify(body ?? null), responseHash],
  );
};

export const requireIdempotencyKey = (scope: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const idempotencyKey = getHeader(req, IDEMPOTENCY_HEADER)?.trim();
    res.setHeader('X-Idempotency-Scope', scope);

    if (!idempotencyKey) {
      if (process.env.REQUIRE_IDEMPOTENCY_KEYS === 'true') {
        res.status(428).json({
          status: 'error',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'X-Idempotency-Key wajib dikirim untuk operasi ini.',
          scope,
          request_id: res.locals.requestId,
          correlation_id: res.locals.correlationId,
        });
        return;
      }

      next();
      return;
    }

    try {
      res.locals.idempotencyKey = idempotencyKey;
      const acquisition = await acquireOrReplay(req, res, scope, idempotencyKey);
      if (!acquisition.proceed || !acquisition.idempotencyId) return;

      const originalJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        persistResponse(acquisition.idempotencyId!, res.statusCode, body)
          .then(() => {
            originalJson(body);
          })
          .catch((error) => {
            console.error(JSON.stringify({
              level: 'error',
              event: 'idempotency_response_persist_failed',
              idempotency_id: acquisition.idempotencyId,
              scope,
              message: error.message,
            }));
            originalJson(body);
          });
        return res;
      }) as Response['json'];

      next();
    } catch (error: any) {
      next(error);
    }
  };
};
