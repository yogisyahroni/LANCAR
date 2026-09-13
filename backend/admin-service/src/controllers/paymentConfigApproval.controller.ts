import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';

export type PaymentConfigChangeType = 'PROVIDER_HEALTH' | 'METHOD_CATALOG';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const idempotencyKeyOf = (req: Request): string =>
  String(req.header('x-idempotency-key') || req.header('idempotency-key') || '').trim();

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const validateProviderHealth = (body: any) => {
  const provider = String(body?.provider || '').trim().toLowerCase().slice(0, 64);
  const state = String(body?.state || '').trim().toLowerCase();
  const reason = String(body?.reason || '').trim().slice(0, 1000);
  if (!provider || !['healthy', 'degraded', 'disabled'].includes(state) || !reason) {
    return { error: 'provider, valid state, and reason are required' } as const;
  }
  return { payload: { provider, state, reason } } as const;
};

const validateMethodCatalog = (body: any) => {
  const marketCode = String(body?.market_code || '').trim().toLowerCase().slice(0, 32);
  const currency = String(body?.currency || '').trim().toUpperCase();
  const paymentMethod = String(body?.payment_method || '').trim().toLowerCase().slice(0, 64);
  const provider = String(body?.provider || '').trim().toLowerCase().slice(0, 64);
  const enabled = body?.enabled;
  const minAmount = body?.min_amount_minor == null ? null : Number(body.min_amount_minor);
  const maxAmount = body?.max_amount_minor == null ? null : Number(body.max_amount_minor);
  if (!marketCode || !/^[A-Z]{3}$/.test(currency) || !paymentMethod || !provider ||
      typeof enabled !== 'boolean' ||
      (minAmount != null && (!Number.isSafeInteger(minAmount) || minAmount <= 0)) ||
      (maxAmount != null && (!Number.isSafeInteger(maxAmount) || maxAmount < (minAmount || 0)))) {
    return { error: 'market, currency, method, provider, enabled, and valid amount bounds are required' } as const;
  }
  return {
    payload: {
      market_code: marketCode,
      currency,
      payment_method: paymentMethod,
      provider,
      enabled,
      min_amount_minor: minAmount,
      max_amount_minor: maxAmount,
    },
  } as const;
};

const validatePayload = (type: PaymentConfigChangeType, body: any) =>
  type === 'PROVIDER_HEALTH' ? validateProviderHealth(body) : validateMethodCatalog(body);

export const requestPaymentConfigChange = async (
  req: Request,
  res: Response,
  type: PaymentConfigChangeType,
): Promise<void> => {
  const key = idempotencyKeyOf(req);
  if (!key) {
    res.status(428).json({ success: false, code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'X-Idempotency-Key is required' });
    return;
  }
  const validated = validatePayload(type, req.body);
  if ('error' in validated) {
    res.status(400).json({ success: false, error: validated.error });
    return;
  }

  const actor = getActorId(req);
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (!reason) {
    res.status(400).json({ success: false, error: 'A change reason is required' });
    return;
  }

  try {
    const inserted = await db.query(
      `INSERT INTO payment_config_change_requests
         (change_type, requested_by, idempotency_key, payload, reason)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, change_type, requested_by, status, idempotency_key, payload, reason, requested_at`,
      [type, actor, key, JSON.stringify(validated.payload), reason],
    );
    let change = inserted.rows[0];
    if (!change) {
      const existing = await db.query(
        `SELECT id, change_type, requested_by, status, idempotency_key, payload, reason, requested_at
           FROM payment_config_change_requests WHERE idempotency_key = $1`,
        [key],
      );
      change = existing.rows[0];
      if (!change) {
        res.status(409).json({ success: false, error: 'Payment config request could not be resolved' });
        return;
      }
      if (change.change_type !== type || change.reason !== reason || canonicalJson(change.payload) !== canonicalJson(validated.payload)) {
        res.status(409).json({ success: false, code: 'IDEMPOTENCY_KEY_REUSE', error: 'Idempotency-Key was already used for a different payment config request' });
        return;
      }
      res.status(202).json({ success: true, duplicate: true, pending_approval: change.status === 'PENDING', data: change });
      return;
    }

    await db.query(
      `INSERT INTO payment_config_change_events (request_id, event_type, actor_id, payload)
       VALUES ($1, 'REQUESTED', $2, $3::jsonb)`,
      [change.id, actor, JSON.stringify({ change_type: type, idempotency_key: key })],
    );
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'payment.config_change.requested', $2, $3::jsonb)`,
      [actor, change.id, JSON.stringify({ change_type: type, idempotency_key: key })],
    );
    res.status(202).json({ success: true, pending_approval: true, data: change });
  } catch (error: any) {
    securityLog.error('admin_payment_config_change_request_failed', { error: error.message, change_type: type });
    res.status(500).json({ success: false, error: 'Payment config change request failed' });
  }
};

const applyChange = async (client: any, change: any, actor: string) => {
  const payload = change.payload as Record<string, any>;
  let applied;
  if (change.change_type === 'PROVIDER_HEALTH') {
    applied = await client.query(
      `INSERT INTO payment_provider_health (provider, state, allow_new_attempts, reason, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider) DO UPDATE SET state = EXCLUDED.state,
         allow_new_attempts = EXCLUDED.allow_new_attempts, reason = EXCLUDED.reason,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING provider, state, allow_new_attempts, reason, updated_at, updated_by`,
      [payload.provider, payload.state, payload.state === 'healthy', payload.reason, actor],
    );
  } else {
    applied = await client.query(
      `INSERT INTO payment_method_catalog
        (market_code, currency, payment_method, provider, enabled, min_amount_minor, max_amount_minor, risk_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (market_code, currency, payment_method, provider) DO UPDATE SET
         enabled = EXCLUDED.enabled, min_amount_minor = EXCLUDED.min_amount_minor,
         max_amount_minor = EXCLUDED.max_amount_minor, version = payment_method_catalog.version + 1,
         updated_at = NOW()
       RETURNING id, market_code, currency, payment_method, provider, enabled,
                 min_amount_minor, max_amount_minor, version, updated_at`,
      [payload.market_code, payload.currency, payload.payment_method, payload.provider,
        payload.enabled, payload.min_amount_minor, payload.max_amount_minor, '{}'],
    );
  }
  return applied.rows[0];
};

export const listPaymentConfigChangeRequests = async (req: Request, res: Response): Promise<void> => {
  const status = String(req.query.status || '').trim().toUpperCase();
  try {
    const result = await readDb.query(
      `SELECT id, change_type, requested_by, approved_by, rejected_by, status,
              idempotency_key, payload, reason, decision_reason,
              requested_at, decided_at, applied_at
         FROM payment_config_change_requests
        WHERE ($1 = '' OR status = $1)
        ORDER BY requested_at DESC LIMIT 200`,
      [status],
    );
    res.json({ success: true, data: result.rows, status: status || null });
  } catch (error: any) {
    securityLog.error('admin_payment_config_change_list_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Payment config change queue unavailable' });
  }
};

export const approvePaymentConfigChange = async (req: Request, res: Response): Promise<void> => {
  const requestId = String(req.params.id || '').trim();
  if (!UUID_PATTERN.test(requestId)) {
    res.status(400).json({ success: false, error: 'Invalid payment config change request id' });
    return;
  }
  const actor = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT id, change_type, requested_by, approved_by, status, payload, reason
         FROM payment_config_change_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    const change = selected.rows[0];
    if (!change) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'Payment config change request not found' }); return; }
    if (change.requested_by === actor) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'MAKER_CHECKER_REQUIRED', error: 'The requester cannot approve the same payment config change' });
      return;
    }
    if (change.status === 'APPLIED') { await client.query('COMMIT'); res.json({ success: true, duplicate: true, data: change }); return; }
    if (change.status !== 'PENDING') {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'PAYMENT_CONFIG_CHANGE_NOT_PENDING', error: `Request is already ${change.status.toLowerCase()}` });
      return;
    }

    const applied = await applyChange(client, change, actor);
    const updated = await client.query(
      `UPDATE payment_config_change_requests
          SET status = 'APPLIED', approved_by = $2, decided_at = NOW(), applied_at = NOW()
        WHERE id = $1
        RETURNING id, change_type, requested_by, approved_by, status, payload, reason, decided_at, applied_at`,
      [requestId, actor],
    );
    await client.query(
      `INSERT INTO payment_config_change_events (request_id, event_type, actor_id, payload)
       VALUES ($1, 'APPLIED', $2, $3::jsonb)`,
      [requestId, actor, JSON.stringify({ applied })],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'payment.config_change.applied', $2, $3::jsonb)`,
      [actor, requestId, JSON.stringify({ change_type: change.change_type, applied })],
    );
    await client.query('COMMIT');
    res.json({ success: true, data: { request: updated.rows[0], applied } });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_payment_config_change_approve_failed', { error: error.message, request_id: requestId });
    res.status(500).json({ success: false, error: 'Payment config change approval failed' });
  } finally {
    client.release();
  }
};

export const rejectPaymentConfigChange = async (req: Request, res: Response): Promise<void> => {
  const requestId = String(req.params.id || '').trim();
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (!UUID_PATTERN.test(requestId) || !reason) {
    res.status(400).json({ success: false, error: 'Valid request id and rejection reason are required' });
    return;
  }
  const actor = getActorId(req);
  const result = await db.query(
    `UPDATE payment_config_change_requests
        SET status = 'REJECTED', rejected_by = $2, decision_reason = $3, decided_at = NOW()
      WHERE id = $1 AND status = 'PENDING' AND requested_by <> $2
      RETURNING id, change_type, requested_by, rejected_by, status, decision_reason, decided_at`,
    [requestId, actor, reason],
  );
  if (!result.rows[0]) {
    res.status(409).json({ success: false, code: 'MAKER_CHECKER_REQUIRED_OR_NOT_PENDING', error: 'Request is not pending or requester cannot reject it' });
    return;
  }
  await db.query(
    `INSERT INTO payment_config_change_events (request_id, event_type, actor_id, payload)
     VALUES ($1, 'REJECTED', $2, $3::jsonb)`,
    [requestId, actor, JSON.stringify({ reason })],
  );
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, 'payment.config_change.rejected', $2, $3::jsonb)`,
    [actor, requestId, JSON.stringify({ reason })],
  );
  res.json({ success: true, data: result.rows[0] });
};
