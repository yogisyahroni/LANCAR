import crypto from 'crypto';
import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';

/**
 * C9: Loyalty / membership tier view.
 *
 * Tier and benefit thresholds are market-scoped runtime configuration from
 * `loyalty_tier_configs`; order history is retained as an informational
 * activity metric and is not used as an implicit pricing policy.
 */

export const getLoyaltyInfo = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const marketCode = String(req.query.market_code || '').trim().toLowerCase();
    const accountResult = await readDb.query(
      `SELECT market_code, points_balance, benefit_balance
         FROM loyalty_accounts
        WHERE owner_id = $1 AND ($2 = '' OR market_code = $2)
        ORDER BY updated_at DESC LIMIT 1`,
      [userId, marketCode],
    );
    if (!accountResult.rows[0]) {
      return res.status(404).json({ success: false, code: 'ERR_LOYALTY_ACCOUNT_NOT_CONFIGURED' });
    }
    const account = accountResult.rows[0];
    const tierResult = await readDb.query(
      `SELECT tier_code, min_points, discount_bps, benefits, version
         FROM loyalty_tier_configs
        WHERE market_code = $1 AND active AND effective_from <= NOW()
          AND (effective_to IS NULL OR effective_to > NOW())
        ORDER BY min_points DESC, version DESC`,
      [account.market_code],
    );
    if (!tierResult.rows.length) {
      return res.status(503).json({ success: false, code: 'ERR_LOYALTY_CONFIG_UNAVAILABLE' });
    }
    const pointsBalance = Number(account.points_balance || 0);
    const current = tierResult.rows.find((tier: any) => pointsBalance >= Number(tier.min_points)) || tierResult.rows[tierResult.rows.length - 1];
    const next = [...tierResult.rows].reverse().find((tier: any) => Number(tier.min_points) > pointsBalance) || null;
    const result = await readDb.query(
      `SELECT
         COUNT(*) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed'))::int AS monthly_orders
       FROM orders
       WHERE customer_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );
    const monthlyOrders = Number(result.rows[0]?.monthly_orders || 0);
    const currentMin = Number(current.min_points);
    const nextMin = next ? Number(next.min_points) : currentMin;
    const progressPct = next ? Math.min(100, Math.round(((pointsBalance - currentMin) / Math.max(1, nextMin - currentMin)) * 100)) : 100;
    const pointsToNext = next ? Math.max(0, nextMin - pointsBalance) : 0;
    const configuredBenefits = current.benefits && typeof current.benefits === 'object' ? current.benefits : {};
    const benefits = Array.isArray(configuredBenefits)
      ? configuredBenefits.filter((benefit: unknown): benefit is string => typeof benefit === 'string')
      : Object.values(configuredBenefits).filter((benefit: unknown): benefit is string => typeof benefit === 'string');

    return res.status(200).json({
      success: true,
      data: {
        market_code: account.market_code,
        tier: current.tier_code,
        tier_version: current.version,
        points_balance: pointsBalance,
        benefit_balance: account.benefit_balance,
        monthly_orders: monthlyOrders,
        discount_pct: Number(current.discount_bps || 0) / 100,
        benefits,
        next_tier: next ? next.tier_code : null,
        next_tier_discount_pct: next ? Number(next.discount_bps || 0) / 100 : null,
        points_to_next_tier: pointsToNext,
        progress_pct: progressPct
      }
    });
  } catch (error) {
    securityLog.error('GET_LOYALTY_INFO_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal memuat info loyalty' });
  }
};

type LoyaltyOrderEvent = {
  owner_id?: string;
  market_code?: string;
  order_id?: string;
  event_type?: 'EARN' | 'REDEEM' | 'EXPIRE' | 'REVERSE';
  points?: number;
  liability_minor?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
};

const internalKeyMatches = (req: Request) => {
  const expected = String(process.env.INTERNAL_LOYALTY_API_KEY || process.env.INTERNAL_API_KEY || '').trim();
  const provided = String(req.header('x-internal-api-key') || '').trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const uuidLike = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/**
 * Internal order-event consumer. The order service remains authoritative for
 * order completion/refund; this endpoint only records an idempotent loyalty
 * projection and never accepts browser/customer traffic.
 */
export const applyLoyaltyOrderEvent = async (req: Request, res: Response): Promise<void> => {
  if (!internalKeyMatches(req)) {
    res.status(401).json({ success: false, code: 'ERR_INTERNAL_UNAUTHORIZED' });
    return;
  }
  const input = (req.body || {}) as LoyaltyOrderEvent;
  const ownerId = String(input.owner_id || '').trim();
  const marketCode = String(input.market_code || '').trim().toLowerCase();
  const orderId = String(input.order_id || '').trim();
  const eventType = String(input.event_type || '').trim().toUpperCase() as LoyaltyOrderEvent['event_type'];
  const points = Number(input.points);
  const liabilityMinor = input.liability_minor == null ? null : Number(input.liability_minor);
  if (!uuidLike(ownerId) || !uuidLike(orderId) || !marketCode || !eventType || !['EARN', 'REDEEM', 'EXPIRE', 'REVERSE'].includes(eventType) || !Number.isSafeInteger(points) || points <= 0 || (liabilityMinor != null && (!Number.isSafeInteger(liabilityMinor) || liabilityMinor < 0))) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_LOYALTY_EVENT' });
    return;
  }
  const delta = eventType === 'EARN' ? points : -points;
  const idempotencyKey = `loyalty:order:${orderId}:${eventType}`;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `INSERT INTO loyalty_accounts (owner_id, market_code) VALUES ($1, $2)
       ON CONFLICT (owner_id, market_code) DO UPDATE SET updated_at = loyalty_accounts.updated_at
       RETURNING id, points_balance`,
      [ownerId, marketCode],
    );
    const accountId = account.rows[0].id;
    const currentBalance = Number(account.rows[0].points_balance);
    const replay = await client.query('SELECT id, account_id FROM loyalty_ledger_entries WHERE idempotency_key = $1', [idempotencyKey]);
    if (replay.rowCount && replay.rows[0].account_id === accountId) {
      const existing = await client.query('SELECT id, market_code, points_balance, benefit_balance FROM loyalty_accounts WHERE id = $1', [accountId]);
      await client.query('COMMIT');
      res.status(200).json({ success: true, duplicate: true, data: existing.rows[0] });
      return;
    }
    if (replay.rowCount) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'ERR_LOYALTY_IDEMPOTENCY_REUSE' });
      return;
    }
    if (currentBalance + delta < 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'ERR_LOYALTY_INSUFFICIENT_POINTS' });
      return;
    }
    const inserted = await client.query(
      `INSERT INTO loyalty_ledger_entries
        (account_id, entry_type, points, source_type, source_id, idempotency_key, liability_minor, reason, metadata)
       VALUES ($1, $2, $3, 'ORDER', $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [accountId, eventType, delta, orderId, idempotencyKey, liabilityMinor, String(input.reason || `order ${eventType.toLowerCase()}`), JSON.stringify(input.metadata || {})],
    );
    if (inserted.rowCount) {
      await client.query(
        `UPDATE loyalty_accounts SET points_balance = points_balance + $2, updated_at = NOW()
         WHERE id = $1`,
        [accountId, delta],
      );
    }
    const updated = await client.query('SELECT id, market_code, points_balance, benefit_balance FROM loyalty_accounts WHERE id = $1', [accountId]);
    await client.query('COMMIT');
    res.status(200).json({ success: true, duplicate: !inserted.rowCount, data: updated.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('LOYALTY_ORDER_EVENT_FAILED', { error: error.message, order_id: orderId, event_type: eventType });
    res.status(500).json({ success: false, code: 'ERR_LOYALTY_EVENT_UNAVAILABLE' });
  } finally {
    client.release();
  }
};
