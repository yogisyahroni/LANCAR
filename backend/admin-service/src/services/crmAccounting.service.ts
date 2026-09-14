import { PoolClient } from 'pg';
import { db } from '../db';

export type CampaignFundingBreakdown = {
  platform: number;
  merchant: number;
  membership: number;
  referral: number;
};

export type FundingValidation = {
  valid: boolean;
  errors: string[];
  normalized: CampaignFundingBreakdown & { total: number };
};

const FUNDING_SOURCES = ['platform', 'merchant', 'membership', 'referral'] as const;

export const validateReservationFunding = (value: unknown, amountMinor: number): FundingValidation => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: string[] = [];
  const normalized = {} as CampaignFundingBreakdown;

  for (const key of FUNDING_SOURCES) {
    const raw = source[key] ?? 0;
    const amount = Number(raw);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      errors.push(`funding_${key}_invalid`);
      normalized[key] = 0;
      continue;
    }
    normalized[key] = amount;
  }

  const total = FUNDING_SOURCES.reduce((sum, key) => sum + normalized[key], 0);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) errors.push('amount_minor_invalid');
  if (total !== amountMinor) errors.push('funding_total_must_equal_amount');
  return { valid: errors.length === 0, errors, normalized: { ...normalized, total } };
};

export const resolveReservationState = (orderStatus: string, actualSubsidyMinor: number): 'RESERVED' | 'CONSUMED' | 'RELEASED' | 'REVERSED' => {
  const status = orderStatus.trim().toLowerCase();
  if (['cancelled', 'canceled', 'expired'].includes(status)) return actualSubsidyMinor > 0 ? 'REVERSED' : 'RELEASED';
  if (['refunded', 'refund_completed', 'payment_refunded'].includes(status)) return 'REVERSED';
  if (['delivered', 'completed', 'pod_completed'].includes(status)) return 'CONSUMED';
  return 'RESERVED';
};

type ReservationRow = {
  id: string;
  campaign_id: string;
  campaign_code: string;
  order_id: string;
  customer_id: string;
  amount_minor: string | number;
  funding_breakdown: unknown;
  state: string;
  order_status: string;
  actual_subsidy_minor: string | number;
};

export type ReservationReconciliation = {
  reservation_id: string;
  campaign_id: string;
  order_id: string;
  expected_minor: number;
  actual_minor: number;
  difference_minor: number;
  funding_breakdown: CampaignFundingBreakdown & { total: number };
  funding_errors: string[];
  reservation_state: 'RESERVED' | 'CONSUMED' | 'RELEASED' | 'REVERSED';
  exception_recorded: boolean;
};

export type CampaignReservation = {
  reservation_id: string;
  campaign_id: string;
  order_id: string;
  customer_id: string;
  amount_minor: number;
  funding_breakdown: CampaignFundingBreakdown & { total: number };
  duplicate: boolean;
};

/**
 * Internal order-service boundary. The order row supplies customer and amount;
 * callers may only supply the already-resolved funding split and idempotency.
 */
export const reserveCrmCampaignReservation = async (
  campaignId: string,
  orderId: string,
  fundingBreakdown: unknown,
  idempotencyKey: string,
): Promise<CampaignReservation> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const campaign = await client.query<{ state: string }>(
      `SELECT state FROM crm_campaigns WHERE id = $1 FOR SHARE`,
      [campaignId],
    );
    if (!campaign.rows[0]) throw Object.assign(new Error('CRM campaign not found'), { statusCode: 404 });
    if (String(campaign.rows[0].state).toUpperCase() !== 'ACTIVE') {
      throw Object.assign(new Error('CRM campaign is not active'), { statusCode: 409 });
    }
    const order = await client.query<{ customer_id: string; promo_subsidy_minor: string | number }>(
      `SELECT customer_id, COALESCE(promo_subsidy_minor, promo_subsidy_idr, 0)::bigint AS promo_subsidy_minor
         FROM orders WHERE id = $1 FOR SHARE`,
      [orderId],
    );
    if (!order.rows[0]) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const amountMinor = Number(order.rows[0].promo_subsidy_minor);
    const funding = validateReservationFunding(fundingBreakdown, amountMinor);
    if (!funding.valid) throw Object.assign(new Error(`Invalid CRM reservation funding: ${funding.errors.join(', ')}`), { statusCode: 400 });

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO crm_campaign_reservations
        (campaign_id, order_id, customer_id, amount_minor, funding_breakdown, idempotency_key)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (campaign_id, order_id) DO NOTHING
       RETURNING id`,
      [campaignId, orderId, order.rows[0].customer_id, amountMinor, JSON.stringify(funding.normalized), idempotencyKey],
    );
    const reservation = inserted.rows[0] || (await client.query<{ id: string }>(
      `SELECT id FROM crm_campaign_reservations WHERE campaign_id = $1 AND order_id = $2`,
      [campaignId, orderId],
    )).rows[0];
    if (!reservation) throw new Error('CRM reservation could not be persisted');
    await client.query('COMMIT');
    return {
      reservation_id: reservation.id,
      campaign_id: campaignId,
      order_id: orderId,
      customer_id: order.rows[0].customer_id,
      amount_minor: amountMinor,
      funding_breakdown: funding.normalized,
      duplicate: !inserted.rowCount,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export type LoyaltyReconciliation = {
  account_id: string;
  expected_balance: number;
  ledger_balance: number;
  difference_minor: number;
  invalid_order_entries: number;
  exception_recorded: boolean;
};

export type ReferralRewardReconciliation = {
  market_code: string;
  expected_liability_minor: number;
  ledger_liability_minor: number;
  difference_minor: number;
  open_reward_attributions: number;
  exception_recorded: boolean;
};

/**
 * Compare referral liabilities with the immutable loyalty liability ledger.
 * A missing reward posting is an explicit Finance exception, never an
 * automatically released customer balance.
 */
export const reconcileReferralRewardBudget = async (marketCode: string, actorId: string | null): Promise<ReferralRewardReconciliation> => {
  const normalizedMarket = marketCode.trim().toLowerCase();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const expected = await client.query<{ expected_liability_minor: string; open_reward_attributions: string }>(
      `SELECT COALESCE(SUM(reward_liability_minor), 0)::bigint AS expected_liability_minor,
              COUNT(*) FILTER (WHERE status IN ('PENDING','QUALIFIED','REVIEW'))::int AS open_reward_attributions
         FROM crm_referral_attributions
        WHERE market_code = $1 AND status IN ('PENDING','QUALIFIED','REWARDED','REVIEW')`,
      [normalizedMarket],
    );
    const actual = await client.query<{ ledger_liability_minor: string }>(
      `SELECT COALESCE(SUM(COALESCE(le.liability_minor, 0)), 0)::bigint AS ledger_liability_minor
         FROM loyalty_ledger_entries le
         JOIN loyalty_accounts la ON la.id = le.account_id
        WHERE le.source_type = 'REFERRAL' AND la.market_code = $1`,
      [normalizedMarket],
    );
    const expectedMinor = Number(expected.rows[0]?.expected_liability_minor || 0);
    const ledgerMinor = Number(actual.rows[0]?.ledger_liability_minor || 0);
    const result = {
      market_code: normalizedMarket,
      expected_liability_minor: expectedMinor,
      ledger_liability_minor: ledgerMinor,
      difference_minor: ledgerMinor - expectedMinor,
      open_reward_attributions: Number(expected.rows[0]?.open_reward_attributions || 0),
      exception_recorded: ledgerMinor !== expectedMinor,
    } satisfies ReferralRewardReconciliation;
    if (result.exception_recorded) {
      await client.query(
        `INSERT INTO crm_reconciliation_exceptions
          (source_type, source_id, expected_minor, actual_minor, difference_minor, reason, state)
         VALUES ('REFERRAL_REWARD_BUDGET', $1, $2, $3, $4, $5::jsonb, 'OPEN')
         ON CONFLICT (source_type, source_id) DO UPDATE SET
           expected_minor = EXCLUDED.expected_minor, actual_minor = EXCLUDED.actual_minor,
           difference_minor = EXCLUDED.difference_minor, reason = EXCLUDED.reason,
           state = 'OPEN', resolved_at = NULL, resolved_by = NULL, resolution_note = NULL`,
        [normalizedMarket, expectedMinor, ledgerMinor, result.difference_minor, JSON.stringify({ open_reward_attributions: result.open_reward_attributions, source_of_expected: 'crm_referral_attributions', source_of_actual: 'loyalty_ledger_entries' })],
      );
    } else {
      await client.query(
        `UPDATE crm_reconciliation_exceptions
            SET state = 'RESOLVED', resolved_at = NOW(), resolved_by = $2,
                resolution_note = 'Referral liability and immutable loyalty ledger agree'
          WHERE source_type = 'REFERRAL_REWARD_BUDGET' AND source_id = $1 AND state IN ('OPEN','IN_REVIEW')`,
        [normalizedMarket, actorId],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'crm.referral.reward_budget_reconciled', $2, $3::jsonb)`,
      [actorId, normalizedMarket, JSON.stringify(result)],
    );
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reconcile the loyalty projection against its immutable ledger and the
 * canonical order/payment/refund state. Any mismatch is reviewable; neither
 * the account balance nor the ledger is repaired in place.
 */
export const reconcileLoyaltyAccount = async (accountId: string, actorId: string | null): Promise<LoyaltyReconciliation> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query<{ id: string; points_balance: string | number }>(
      `SELECT id, points_balance FROM loyalty_accounts WHERE id = $1 FOR UPDATE`,
      [accountId],
    );
    if (!account.rows[0]) throw Object.assign(new Error('Loyalty account not found'), { statusCode: 404 });
    const ledger = await client.query<{ ledger_balance: string | number }>(
      `SELECT COALESCE(SUM(points), 0)::bigint AS ledger_balance
         FROM loyalty_ledger_entries WHERE account_id = $1`,
      [accountId],
    );
    const invalid = await client.query<{ invalid_order_entries: string | number }>(
      `WITH order_entries AS (
             SELECT source_id,
                    BOOL_OR(entry_type = 'EARN') AS has_earn,
                    BOOL_OR(entry_type = 'REDEEM') AS has_redeem,
                    BOOL_OR(entry_type = 'REVERSE') AS has_reverse
               FROM loyalty_ledger_entries
              WHERE account_id = $1 AND source_type = 'ORDER'
              GROUP BY source_id
           ),
           refund_totals AS (
             SELECT pi.order_id,
                    COALESCE(SUM(pr.amount_minor) FILTER (WHERE pr.status = 'SUCCEEDED'), 0)::bigint AS refunded_minor
               FROM payment_intents pi
               LEFT JOIN payment_refunds pr ON pr.intent_id = pi.id
              GROUP BY pi.order_id
           )
       SELECT COUNT(*)::int AS invalid_order_entries
         FROM order_entries le
         LEFT JOIN orders o ON o.id::text = le.source_id
         LEFT JOIN payments p ON p.order_id = o.id
         LEFT JOIN refund_totals rt ON rt.order_id = o.id
        WHERE (
          le.has_earn AND (
            LOWER(COALESCE(o.status::text, '')) NOT IN ('delivered','completed','pod_completed')
            OR LOWER(COALESCE(p.status::text, '')) NOT IN ('paid','settled')
            OR (COALESCE(rt.refunded_minor, 0) > 0 AND NOT le.has_reverse)
          )
        ) OR (
          le.has_redeem AND (
            LOWER(COALESCE(o.status::text, '')) IN ('cancelled','canceled','failed','payment_failed','refunded','refund_completed','payment_refunded')
            OR LOWER(COALESCE(p.status::text, '')) IN ('refunded','cancelled','failed')
            OR COALESCE(rt.refunded_minor, 0) > 0
          ) AND NOT le.has_reverse
        ) OR (
          le.has_reverse AND (
            LOWER(COALESCE(o.status::text, '')) NOT IN ('cancelled','canceled','refunded','refund_completed','payment_refunded')
            AND LOWER(COALESCE(p.status::text, '')) NOT IN ('refunded','cancelled')
            AND COALESCE(rt.refunded_minor, 0) = 0
          )
        )`,
      [accountId],
    );
    const expectedBalance = Number(account.rows[0].points_balance);
    const ledgerBalance = Number(ledger.rows[0]?.ledger_balance || 0);
    const invalidOrderEntries = Number(invalid.rows[0]?.invalid_order_entries || 0);
    const differenceMinor = ledgerBalance - expectedBalance;
    const reconciliation = {
      account_id: accountId,
      expected_balance: expectedBalance,
      ledger_balance: ledgerBalance,
      difference_minor: differenceMinor,
      invalid_order_entries: invalidOrderEntries,
      exception_recorded: differenceMinor !== 0 || invalidOrderEntries > 0,
    } satisfies LoyaltyReconciliation;
    if (reconciliation.exception_recorded) {
      await client.query(
        `INSERT INTO crm_reconciliation_exceptions
          (source_type, source_id, expected_minor, actual_minor, difference_minor, reason, state)
         VALUES ('LOYALTY_ACCOUNT', $1, $2, $3, $4, $5, 'OPEN')
         ON CONFLICT (source_type, source_id) DO UPDATE SET
           expected_minor = EXCLUDED.expected_minor,
           actual_minor = EXCLUDED.actual_minor,
           difference_minor = EXCLUDED.difference_minor,
           reason = EXCLUDED.reason,
           state = 'OPEN', resolved_at = NULL, resolved_by = NULL, resolution_note = NULL`,
        [accountId, expectedBalance, ledgerBalance, differenceMinor, JSON.stringify({ invalid_order_entries: invalidOrderEntries, source_of_truth: 'loyalty_ledger_entries+orders+payments' })],
      );
    } else {
      await client.query(
        `UPDATE crm_reconciliation_exceptions
            SET state = 'RESOLVED', resolved_at = NOW(), resolution_note = 'Loyalty ledger and canonical order/payment state agree'
          WHERE source_type = 'LOYALTY_ACCOUNT' AND source_id = $1 AND state IN ('OPEN','IN_REVIEW')`,
        [accountId],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'crm.loyalty.reconciled', $2, $3::jsonb)`,
      [actorId, accountId, JSON.stringify(reconciliation)],
    );
    await client.query('COMMIT');
    return reconciliation;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const insertAudit = async (client: Pick<PoolClient, 'query'>, actorId: string | null, reservationId: string, result: ReservationReconciliation) => {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, 'crm.campaign_reservation.reconciled', $2, $3::jsonb)`,
    [actorId, reservationId, JSON.stringify({
      order_id: result.order_id,
      expected_minor: result.expected_minor,
      actual_minor: result.actual_minor,
      difference_minor: result.difference_minor,
      reservation_state: result.reservation_state,
      funding_errors: result.funding_errors,
    })],
  );
};

/**
 * Reconcile CRM campaign subsidy against the order-service amount. CRM owns
 * the reservation projection only; the order row is the authoritative actual.
 * Mismatches become reviewable exceptions and never get silently overwritten.
 */
export const reconcileCrmCampaignReservation = async (reservationId: string, actorId: string | null, settlementReference: string): Promise<ReservationReconciliation> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<ReservationRow>(
      `SELECT r.id, r.campaign_id, c.campaign_code, r.order_id, r.customer_id,
              r.amount_minor, r.funding_breakdown, r.state,
              o.status AS order_status,
              COALESCE(o.promo_subsidy_minor, o.promo_subsidy_idr, 0)::bigint AS actual_subsidy_minor
         FROM crm_campaign_reservations r
         JOIN crm_campaigns c ON c.id = r.campaign_id
         JOIN orders o ON o.id = r.order_id
        WHERE r.id = $1
        FOR UPDATE OF r, o`,
      [reservationId],
    );
    const row = result.rows[0];
    if (!row) {
      const error = Object.assign(new Error('CRM campaign reservation not found'), { statusCode: 404 });
      throw error;
    }

    const expectedMinor = Number(row.amount_minor);
    const actualMinor = Number(row.actual_subsidy_minor);
    const funding = validateReservationFunding(row.funding_breakdown, expectedMinor);
    const differenceMinor = actualMinor - expectedMinor;
    const reservationState = resolveReservationState(String(row.order_status), actualMinor);
    const reconciliation = {
      reservation_id: row.id,
      campaign_id: row.campaign_id,
      order_id: row.order_id,
      expected_minor: expectedMinor,
      actual_minor: actualMinor,
      difference_minor: differenceMinor,
      funding_breakdown: funding.normalized,
      funding_errors: funding.errors,
      reservation_state: reservationState,
      exception_recorded: differenceMinor !== 0 || funding.errors.length > 0,
    } satisfies ReservationReconciliation;

    await client.query(
      `UPDATE crm_campaign_reservations
          SET state = $2, settlement_reference = $3, settled_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [row.id, reservationState, settlementReference,],
    );

    if (reconciliation.exception_recorded) {
      await client.query(
        `INSERT INTO crm_reconciliation_exceptions
          (source_type, source_id, expected_minor, actual_minor, difference_minor, reason, state)
         VALUES ('CRM_CAMPAIGN_ORDER', $1, $2, $3, $4, $5, 'OPEN')
         ON CONFLICT (source_type, source_id) DO UPDATE SET
           expected_minor = EXCLUDED.expected_minor,
           actual_minor = EXCLUDED.actual_minor,
           difference_minor = EXCLUDED.difference_minor,
           reason = EXCLUDED.reason,
           state = 'OPEN',
           resolved_at = NULL,
           resolved_by = NULL,
           resolution_note = NULL`,
        [row.id, expectedMinor, actualMinor, differenceMinor, JSON.stringify({
          campaign_code: row.campaign_code,
          order_status: row.order_status,
          funding_errors: funding.errors,
          source_of_actual: 'orders.promo_subsidy_minor',
        })],
      );
    } else {
      await client.query(
        `UPDATE crm_reconciliation_exceptions
            SET state = 'RESOLVED', resolved_at = NOW(), resolution_note = 'Reconciled against canonical order subsidy'
          WHERE source_type = 'CRM_CAMPAIGN_ORDER' AND source_id = $1 AND state IN ('OPEN','IN_REVIEW')`,
        [row.id],
      );
    }
    await insertAudit(client, actorId, row.id, reconciliation);
    await client.query('COMMIT');
    return reconciliation;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
