import crypto from 'crypto';
import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import { membershipStateAllowsBenefit, resolveMembershipPaymentTransition, MembershipPaymentState, MembershipState } from '../services/crmPolicy';

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

/** Customer-scoped immutable history; current balance remains the account projection. */
export const getLoyaltyLedger = async (req: Request, res: Response): Promise<void> => {
  const userId = getActorId(req);
  const marketCode = String(req.query.market_code || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '50'), 10) || 50, 1), 100);
  try {
    const result = await readDb.query(
      `SELECT le.id, la.market_code, le.entry_type, le.points, le.source_type,
              le.source_id, le.liability_minor, le.reason, le.metadata, le.created_at
         FROM loyalty_ledger_entries le
         JOIN loyalty_accounts la ON la.id = le.account_id
        WHERE la.owner_id = $1 AND ($2 = '' OR la.market_code = $2)
        ORDER BY le.created_at DESC LIMIT $3`,
      [userId, marketCode, limit],
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('GET_LOYALTY_LEDGER_FAILED', { error: error?.message });
    res.status(500).json({ success: false, code: 'ERR_LOYALTY_LEDGER_UNAVAILABLE' });
  }
};

/** Entitlement read model; payment/order services remain authoritative for mutation. */
export const getMembershipEntitlements = async (req: Request, res: Response): Promise<void> => {
  const userId = getActorId(req);
  try {
    const result = await readDb.query(
      `SELECT e.id, p.plan_code, p.version, p.market_code, p.currency,
              p.billing_cycle, p.benefits, e.state, e.current_period_start,
              e.current_period_end, e.payment_intent_id, e.created_at, e.updated_at
         FROM crm_membership_entitlements e
         JOIN crm_membership_plans p ON p.id = e.plan_id
        WHERE e.owner_id = $1
        ORDER BY e.current_period_end DESC`,
      [userId],
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('GET_MEMBERSHIP_ENTITLEMENTS_FAILED', { error: error?.message });
    res.status(500).json({ success: false, code: 'ERR_MEMBERSHIP_UNAVAILABLE' });
  }
};

type MembershipEligibilityRequest = {
  owner_id?: string;
  market_code?: string;
  service_code?: string;
  benefit_code?: string;
};

/**
 * Internal order/pricing read boundary. The order service asks for a benefit
 * decision; it never accepts a client-composed membership discount. Payment
 * state remains authoritative, so PENDING_PAYMENT entitlements are ineligible.
 */
export const resolveMembershipBenefitEligibility = async (req: Request, res: Response): Promise<void> => {
  if (!internalKeyMatches(req)) {
    res.status(401).json({ success: false, code: 'ERR_INTERNAL_UNAUTHORIZED' });
    return;
  }
  const input = (req.body || {}) as MembershipEligibilityRequest;
  const ownerId = String(input.owner_id || '').trim();
  const marketCode = String(input.market_code || '').trim().toLowerCase();
  const serviceCode = String(input.service_code || '').trim().toLowerCase();
  const benefitCode = String(input.benefit_code || 'free_delivery').trim().toLowerCase();
  if (!uuidLike(ownerId) || !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(marketCode) || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(serviceCode) || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(benefitCode)) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_MEMBERSHIP_ELIGIBILITY_REQUEST' });
    return;
  }
  try {
    const result = await readDb.query(
      `SELECT e.id, e.state, e.current_period_end, e.payment_intent_id,
              p.plan_code, p.version, p.market_code, p.currency, p.benefits
         FROM crm_membership_entitlements e
         JOIN crm_membership_plans p ON p.id = e.plan_id
        WHERE e.owner_id = $1 AND p.market_code = $2
        ORDER BY e.current_period_end DESC, e.updated_at DESC LIMIT 1`,
      [ownerId, marketCode],
    );
    const entitlement = result.rows[0];
    if (!entitlement) {
      res.json({ success: true, data: { eligible: false, reason: 'NO_ENTITLEMENT', service_code: serviceCode, benefit_code: benefitCode } });
      return;
    }
    const benefitCatalog = entitlement.benefits && typeof entitlement.benefits === 'object' ? entitlement.benefits : {};
    const configuredBenefit = (benefitCatalog as any)[benefitCode];
    const benefit = configuredBenefit && typeof configuredBenefit === 'object' ? configuredBenefit : { enabled: configuredBenefit === true };
    const allowedServices = Array.isArray(benefit.service_codes) ? benefit.service_codes.map((value: unknown) => String(value).toLowerCase()) : null;
    const active = membershipStateAllowsBenefit(String(entitlement.state) as any, new Date(entitlement.current_period_end));
    const serviceAllowed = !allowedServices || allowedServices.includes(serviceCode);
    const eligible = active && serviceAllowed && benefit.enabled !== false;
    const reason = !active
      ? 'ENTITLEMENT_NOT_ACTIVE'
      : !serviceAllowed
        ? 'SERVICE_NOT_ELIGIBLE'
        : benefit.enabled === false
          ? 'BENEFIT_NOT_CONFIGURED'
          : 'ELIGIBLE';
    res.json({
      success: true,
      data: {
        eligible,
        reason,
        owner_id: ownerId,
        market_code: entitlement.market_code,
        service_code: serviceCode,
        benefit_code: benefitCode,
        entitlement_id: entitlement.id,
        plan_code: entitlement.plan_code,
        plan_version: entitlement.version,
        currency: entitlement.currency,
        period_end: entitlement.current_period_end,
        funding_source: eligible ? 'MEMBERSHIP' : null,
        subsidy_cap_minor: eligible && Number.isSafeInteger(Number(benefit.cap_minor)) ? Number(benefit.cap_minor) : null,
        payment_intent_id: entitlement.payment_intent_id || null,
      },
    });
  } catch (error: any) {
    securityLog.error('RESOLVE_MEMBERSHIP_ELIGIBILITY_FAILED', { error: error?.message, market_code: marketCode });
    res.status(500).json({ success: false, code: 'ERR_MEMBERSHIP_ELIGIBILITY_UNAVAILABLE' });
  }
};

type MembershipPaymentEvent = {
  payment_state?: MembershipPaymentState;
  payment_intent_id?: string;
  provider_reference?: string;
};

/** Payment-service callback boundary; pending entitlements cannot become active without success. */
export const applyMembershipPaymentEvent = async (req: Request, res: Response): Promise<void> => {
  if (!internalKeyMatches(req)) {
    res.status(401).json({ success: false, code: 'ERR_INTERNAL_UNAUTHORIZED' });
    return;
  }
  const entitlementId = String(req.params.entitlementId || '').trim();
  const idempotencyKey = String(req.header('x-idempotency-key') || '').trim().slice(0, 180);
  const input = (req.body || {}) as MembershipPaymentEvent;
  const paymentState = String(input.payment_state || '').trim().toUpperCase() as MembershipPaymentState;
  const paymentIntentId = String(input.payment_intent_id || '').trim();
  const providerReference = String(input.provider_reference || '').trim().slice(0, 180);
  if (!uuidLike(entitlementId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,179}$/.test(idempotencyKey) || !['SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'].includes(paymentState)) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_MEMBERSHIP_PAYMENT_EVENT' });
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const entitlement = await client.query<{ id: string; state: MembershipState; payment_intent_id: string | null }>(
      `SELECT id, state, payment_intent_id FROM crm_membership_entitlements WHERE id = $1 FOR UPDATE`,
      [entitlementId],
    );
    if (!entitlement.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, code: 'ERR_MEMBERSHIP_ENTITLEMENT_NOT_FOUND' });
      return;
    }
    if (entitlement.rows[0].payment_intent_id && paymentIntentId && entitlement.rows[0].payment_intent_id !== paymentIntentId) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'ERR_MEMBERSHIP_PAYMENT_INTENT_MISMATCH' });
      return;
    }
    const nextState = resolveMembershipPaymentTransition(entitlement.rows[0].state, paymentState);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO crm_membership_payment_events
        (entitlement_id, idempotency_key, payment_state, resulting_state, payment_intent_id, provider_reference)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [entitlementId, idempotencyKey, paymentState, nextState, paymentIntentId || entitlement.rows[0].payment_intent_id, providerReference || null],
    );
    if (!inserted.rowCount) {
      const existingEvent = await client.query<{ payment_state: string; payment_intent_id: string | null; provider_reference: string | null; resulting_state: string }>(
        `SELECT payment_state, payment_intent_id, provider_reference, resulting_state
           FROM crm_membership_payment_events WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      const replay = existingEvent.rows[0];
      if (!replay || replay.payment_state !== paymentState || (replay.payment_intent_id || '') !== (paymentIntentId || entitlement.rows[0].payment_intent_id || '') || (replay.provider_reference || '') !== (providerReference || '') || replay.resulting_state !== nextState) {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, code: 'ERR_MEMBERSHIP_IDEMPOTENCY_REUSE' });
        return;
      }
      const current = await client.query(`SELECT id, state, updated_at FROM crm_membership_entitlements WHERE id = $1`, [entitlementId]);
      await client.query('COMMIT');
      res.json({ success: true, duplicate: true, data: current.rows[0] });
      return;
    }
    const updated = await client.query(
      `UPDATE crm_membership_entitlements
          SET state = $2,
              current_period_start = CASE
                WHEN $3 = 'SUCCEEDED' AND state = 'ACTIVE' THEN current_period_start
                WHEN $2 = 'ACTIVE' AND state <> 'ACTIVE' THEN NOW()
                ELSE current_period_start
              END,
              current_period_end = CASE
                WHEN $3 = 'SUCCEEDED' AND state = 'ACTIVE' THEN GREATEST(current_period_end, NOW()) + INTERVAL '30 days'
                WHEN $2 = 'ACTIVE' AND state <> 'ACTIVE' THEN NOW() + INTERVAL '30 days'
                ELSE current_period_end
              END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, state, current_period_start, current_period_end, payment_intent_id, updated_at`,
      [entitlementId, nextState, paymentState],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES (NULL, 'crm.membership.payment_state_applied', $1, $2::jsonb)`,
      [entitlementId, JSON.stringify({ payment_state: paymentState, resulting_state: nextState, payment_intent_id: paymentIntentId || null, provider_reference_present: Boolean(providerReference) })],
    );
    await client.query('COMMIT');
    res.status(200).json({ success: true, duplicate: false, data: updated.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('APPLY_MEMBERSHIP_PAYMENT_EVENT_FAILED', { error: error?.message, entitlement_id: entitlementId, payment_state: paymentState });
    res.status(500).json({ success: false, code: 'ERR_MEMBERSHIP_PAYMENT_EVENT_UNAVAILABLE' });
  } finally {
    client.release();
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
    const order = await client.query<{ customer_id: string; status: string }>(
      `SELECT customer_id, status FROM orders WHERE id = $1 FOR SHARE`,
      [orderId],
    );
    if (!order.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, code: 'ERR_LOYALTY_ORDER_NOT_FOUND' });
      return;
    }
    if (String(order.rows[0].customer_id) !== ownerId) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, code: 'ERR_LOYALTY_ORDER_OWNER_MISMATCH' });
      return;
    }
    const orderStatus = String(order.rows[0].status || '').trim().toLowerCase();
    const qualifyingStatus = ['delivered', 'completed', 'pod_completed'].includes(orderStatus);
    const reversibleStatus = ['cancelled', 'refunded', 'refund_completed', 'payment_refunded'].includes(orderStatus);
    if (eventType === 'EARN' && !qualifyingStatus) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'ERR_LOYALTY_ORDER_NOT_QUALIFYING' });
      return;
    }
    if (eventType === 'REVERSE' && !reversibleStatus) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'ERR_LOYALTY_ORDER_NOT_REVERSIBLE' });
      return;
    }
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

/**
 * Finance-only compensating adjustment. The immutable ledger remains the
 * source of truth; an adjustment is never an in-place balance edit and must
 * carry a human reason plus the request idempotency key.
 */
export const adjustLoyaltyAccount = async (req: Request, res: Response): Promise<void> => {
  const accountId = String(req.params.accountId || '').trim();
  const points = Number(req.body?.points);
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const idempotencyKey = String(req.header('x-idempotency-key') || '').trim().slice(0, 120);
  if (!uuidLike(accountId) || !Number.isSafeInteger(points) || points === 0 || !reason || reason.length < 8 || !idempotencyKey) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_LOYALTY_ADJUSTMENT' });
    return;
  }
  const actor = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query<{ id: string; points_balance: string }>(
      `SELECT id, points_balance FROM loyalty_accounts WHERE id = $1 FOR UPDATE`,
      [accountId],
    );
    if (!account.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, code: 'ERR_LOYALTY_ACCOUNT_NOT_FOUND' });
      return;
    }
    const current = Number(account.rows[0].points_balance);
    if (current + points < 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'ERR_LOYALTY_INSUFFICIENT_POINTS' });
      return;
    }
    const entry = await client.query<{ id: string }>(
      `INSERT INTO loyalty_ledger_entries
        (account_id, entry_type, points, source_type, source_id, idempotency_key, reason, metadata)
       VALUES ($1, 'ADJUSTMENT', $2, 'ADMIN', $3, $4, $5, $6::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [accountId, points, actor, `loyalty:manual:${idempotencyKey}`, reason, JSON.stringify({ actor_id: actor, request_idempotency_key: idempotencyKey })],
    );
    if (entry.rowCount) {
      await client.query(`UPDATE loyalty_accounts SET points_balance = points_balance + $2, updated_at = NOW() WHERE id = $1`, [accountId, points]);
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload)
         VALUES ($1, 'crm.loyalty.adjustment.created', $2, $3::jsonb)`,
        [actor, accountId, JSON.stringify({ points, reason, ledger_entry_id: entry.rows[0].id })],
      );
    }
    const updated = await client.query(`SELECT id, market_code, points_balance, benefit_balance FROM loyalty_accounts WHERE id = $1`, [accountId]);
    await client.query('COMMIT');
    res.json({ success: true, duplicate: !entry.rowCount, data: updated.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('CRM_LOYALTY_ADJUSTMENT_FAILED', { error: error?.message, account_id: accountId });
    res.status(500).json({ success: false, code: 'ERR_LOYALTY_ADJUSTMENT_UNAVAILABLE' });
  } finally {
    client.release();
  }
};
