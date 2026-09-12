import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const limitOf = (value: unknown, fallback = 50) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 250) : fallback;
};
const jsonObject = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const listPaymentProviderHealth = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(
      `SELECT provider, state, allow_new_attempts, reason, updated_at, updated_by
         FROM payment_provider_health ORDER BY provider`,
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('admin_payment_health_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Payment provider health unavailable' });
  }
};

export const listPaymentMethodCatalog = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(
      `SELECT id, market_code, currency, payment_method, provider, enabled,
              min_amount_minor, max_amount_minor, risk_context, version, updated_at
         FROM payment_method_catalog
        WHERE ($1 = '' OR market_code = $1)
        ORDER BY market_code, currency, payment_method, provider
        LIMIT $2`,
      [String(req.query.market_code || '').trim().toLowerCase(), limitOf(req.query.limit, 200)],
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('admin_payment_method_catalog_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Payment method catalog unavailable' });
  }
};

export const updatePaymentMethodCatalog = async (req: Request, res: Response): Promise<void> => {
  const marketCode = String(req.body?.market_code || '').trim().toLowerCase().slice(0, 32);
  const currency = String(req.body?.currency || '').trim().toUpperCase();
  const paymentMethod = String(req.body?.payment_method || '').trim().toLowerCase().slice(0, 64);
  const provider = String(req.body?.provider || '').trim().toLowerCase().slice(0, 64);
  const enabled = req.body?.enabled;
  const minAmount = req.body?.min_amount_minor == null ? null : Number(req.body.min_amount_minor);
  const maxAmount = req.body?.max_amount_minor == null ? null : Number(req.body.max_amount_minor);
  if (!marketCode || !/^[A-Z]{3}$/.test(currency) || !paymentMethod || !provider || typeof enabled !== 'boolean' || (minAmount != null && (!Number.isSafeInteger(minAmount) || minAmount <= 0)) || (maxAmount != null && (!Number.isSafeInteger(maxAmount) || maxAmount < (minAmount || 0)))) {
    res.status(400).json({ success: false, error: 'market, currency, method, provider, enabled, and valid amount bounds are required' });
    return;
  }
  try {
    const actor = getActorId(req);
    const result = await db.query(
      `INSERT INTO payment_method_catalog
        (market_code, currency, payment_method, provider, enabled, min_amount_minor, max_amount_minor, risk_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (market_code, currency, payment_method, provider) DO UPDATE SET
         enabled = EXCLUDED.enabled, min_amount_minor = EXCLUDED.min_amount_minor,
         max_amount_minor = EXCLUDED.max_amount_minor, version = payment_method_catalog.version + 1,
         updated_at = NOW()
       RETURNING id, market_code, currency, payment_method, provider, enabled, min_amount_minor, max_amount_minor, version, updated_at`,
      [marketCode, currency, paymentMethod, provider, enabled, minAmount, maxAmount, '{}'],
    );
    await db.query(`INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'payment.method_catalog.updated', $2, $3::jsonb)`, [actor, result.rows[0].id, JSON.stringify({ market_code: marketCode, currency, payment_method: paymentMethod, provider, enabled, min_amount_minor: minAmount, max_amount_minor: maxAmount })]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_payment_method_catalog_update_failed', { error: error.message, market_code: marketCode, payment_method: paymentMethod });
    res.status(500).json({ success: false, error: 'Payment method catalog update failed' });
  }
};

export const listPaymentIntents = async (req: Request, res: Response): Promise<void> => {
  try {
    const state = String(req.query.state || '').trim().toUpperCase();
    const result = await readDb.query(
      `SELECT pi.id, pi.order_id, pi.customer_id, pi.market_code, pi.currency,
              pi.amount_minor, pi.provider, pi.payment_method, pi.state,
              pi.provider_raw_status, pi.provider_reference, pi.routing_rule_version,
              pi.version, pi.expires_at, pi.created_at, pi.updated_at,
              latest.event_id AS latest_event_id, latest.source AS latest_event_source,
              latest.occurred_at AS latest_event_at
         FROM payment_intents pi
         LEFT JOIN LATERAL (
           SELECT event_id, source, occurred_at
             FROM payment_intent_events WHERE intent_id = pi.id
            ORDER BY occurred_at DESC LIMIT 1
         ) latest ON TRUE
        WHERE ($1 = '' OR pi.state = $1)
        ORDER BY pi.updated_at DESC LIMIT $2`,
      [state, limitOf(req.query.limit)],
    );
    res.json({ success: true, data: result.rows, state: state || null });
  } catch (error: any) {
    securityLog.error('admin_payment_intents_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Payment intents unavailable' });
  }
};

export const listPaymentExceptions = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = String(req.query.status || 'OPEN').trim().toUpperCase();
    const result = await readDb.query(
      `SELECT id, intent_id, provider, provider_reference, exception_type,
              expected_state, actual_state, expected_amount_minor, actual_amount_minor,
              currency, provider_batch_date, status, metadata, first_seen_at, last_seen_at,
              resolved_at, resolved_by, resolution_note
         FROM payment_reconciliation_exceptions
        WHERE ($1 = '' OR status = $1)
        ORDER BY last_seen_at DESC LIMIT $2`,
      [status, limitOf(req.query.limit)],
    );
    res.json({ success: true, data: result.rows, status: status || null });
  } catch (error: any) {
    securityLog.error('admin_payment_exceptions_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Payment reconciliation queue unavailable' });
  }
};

export const listPaymentChargebacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const state = String(req.query.state || '').trim().toUpperCase();
    const result = await readDb.query(
      `SELECT id, intent_id, provider, provider_case_reference, amount_minor, currency,
              state, evidence_deadline, liability_owner, created_at, updated_at
         FROM payment_chargebacks
        WHERE ($1 = '' OR state = $1)
        ORDER BY CASE WHEN evidence_deadline IS NULL THEN 1 ELSE 0 END,
                 evidence_deadline ASC NULLS LAST, updated_at DESC LIMIT $2`,
      [state, limitOf(req.query.limit)],
    );
    res.json({ success: true, data: result.rows, state: state || null });
  } catch (error: any) {
    securityLog.error('admin_payment_chargebacks_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Payment chargebacks unavailable' });
  }
};

export const listPaymentIntentEvents = async (req: Request, res: Response): Promise<void> => {
  const intentId = String(req.params.id || '').trim();
  if (!UUID_PATTERN.test(intentId)) {
    res.status(400).json({ success: false, error: 'Invalid payment intent id' });
    return;
  }
  try {
    const result = await readDb.query(
      `SELECT id, event_id, source, provider_raw_status, normalized_state,
              provider_reference, payload, occurred_at, received_at
         FROM payment_intent_events
        WHERE intent_id = $1
        ORDER BY occurred_at ASC, received_at ASC LIMIT $2`,
      [intentId, limitOf(req.query.limit, 200)],
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('admin_payment_intent_events_failed', { error: error.message, intent_id: intentId });
    res.status(500).json({ success: false, error: 'Payment intent timeline unavailable' });
  }
};

export const updatePaymentProviderHealth = async (req: Request, res: Response): Promise<void> => {
  const provider = String(req.body?.provider || '').trim().toLowerCase().slice(0, 64);
  const state = String(req.body?.state || '').trim().toLowerCase();
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (!provider || !['healthy', 'degraded', 'disabled'].includes(state) || !reason) {
    res.status(400).json({ success: false, error: 'provider, valid state, and reason are required' });
    return;
  }
  try {
    const actor = getActorId(req);
    const result = await db.query(
      `INSERT INTO payment_provider_health (provider, state, allow_new_attempts, reason, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider) DO UPDATE SET state = EXCLUDED.state,
         allow_new_attempts = EXCLUDED.allow_new_attempts, reason = EXCLUDED.reason,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING provider, state, allow_new_attempts, reason, updated_at, updated_by`,
      [provider, state, state === 'healthy', reason, actor],
    );
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'payment.provider_health.updated', NULL, $2::jsonb)`,
      [actor, JSON.stringify({ provider, state, reason })],
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_payment_health_update_failed', { error: error.message, provider });
    res.status(500).json({ success: false, error: 'Payment provider health update failed' });
  }
};

export const requestPaymentAction = async (req: Request, res: Response): Promise<void> => {
  const intentId = String(req.params.id || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(intentId) || !['refund', 'void'].includes(action)) {
    res.status(400).json({ success: false, error: 'Invalid payment action' });
    return;
  }
  const idempotencyKey = String(req.header('Idempotency-Key') || '').trim();
  if (!idempotencyKey) {
    res.status(400).json({ success: false, error: 'Idempotency-Key is required' });
    return;
  }
  const actor = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const intent = await client.query(
      `SELECT id, state, amount_minor, currency, provider, provider_reference
         FROM payment_intents WHERE id = $1 FOR UPDATE`,
      [intentId],
    );
    if (!intent.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Payment intent not found' });
      return;
    }
    if (action === 'void') {
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload)
         VALUES ($1, 'payment.void.requested_without_provider', $2, $3::jsonb)`,
        [actor, intentId, JSON.stringify({ idempotency_key: idempotencyKey, provider: intent.rows[0].provider })],
      );
      await client.query('COMMIT');
      res.status(409).json({ success: false, code: 'ERR_PROVIDER_ACTION_UNAVAILABLE', message: 'Void is queued only after an approved provider adapter is configured' });
      return;
    }
    const amount = Number(req.body?.amount_minor ?? intent.rows[0].amount_minor);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > Number(intent.rows[0].amount_minor)) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Refund amount is invalid' });
      return;
    }
    const existing = await client.query(
      `SELECT id, intent_id, amount_minor, currency, status, provider_reference
         FROM payment_refunds WHERE idempotency_key = $1 FOR UPDATE`,
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].intent_id !== intentId || Number(existing.rows[0].amount_minor) !== amount) {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, error: 'Idempotency-Key was already used with a different refund request' });
        return;
      }
      await client.query('COMMIT');
      res.status(202).json({ success: true, duplicate: true, data: existing.rows[0], provider_dispatch_required: existing.rows[0].status === 'REQUESTED' });
      return;
    }
    const totalRefunded = await client.query(
      `SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
         FROM payment_refunds WHERE intent_id = $1 AND status IN ('REQUESTED','PROCESSING','SUCCEEDED','UNKNOWN')`,
      [intentId],
    );
    if (Number(totalRefunded.rows[0]?.total || 0) + amount > Number(intent.rows[0].amount_minor)) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Refund amount exceeds the remaining refundable balance' });
      return;
    }
    const refund = await client.query(
      `INSERT INTO payment_refunds (intent_id, idempotency_key, amount_minor, currency, provider_reference, status)
       VALUES ($1, $2, $3, $4, $5, 'REQUESTED')
       ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING id, intent_id, idempotency_key, amount_minor, currency, provider_reference, status, created_at`,
      [intentId, idempotencyKey, amount, intent.rows[0].currency, intent.rows[0].provider_reference || null],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'payment.refund.requested', $2, $3::jsonb)`,
      [actor, intentId, JSON.stringify({ refund_id: refund.rows[0].id, amount_minor: amount, idempotency_key: idempotencyKey })],
    );
    await client.query('COMMIT');
    res.status(202).json({ success: true, data: refund.rows[0], provider_dispatch_required: true });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_payment_action_failed', { error: error.message, intent_id: intentId, action });
    res.status(500).json({ success: false, error: 'Payment action could not be recorded' });
  } finally {
    client.release();
  }
};

export const listAdminReputationReviews = async (req: Request, res: Response): Promise<void> => {
  const state = String(req.query.state || '').trim().toUpperCase();
  const reviewerId = String(req.query.reviewer_id || '').trim();
  const subjectId = String(req.query.subject_id || '').trim();
  const orderId = String(req.query.order_id || '').trim();
  const serviceCode = String(req.query.service_code || '').trim().toLowerCase();
  const marketCode = String(req.query.market_code || '').trim().toLowerCase();
  for (const value of [reviewerId, subjectId, orderId]) {
    if (value && !UUID_PATTERN.test(value)) {
      res.status(400).json({ success: false, error: 'Invalid reputation actor/order filter' });
      return;
    }
  }
  try {
    const result = await readDb.query(
      `SELECT id, reviewer_id, subject_id, order_id, service_code, market_code, stars,
              dimensions, body, state, moderation_reason, quality_rule_version, created_at, updated_at
         FROM reputation_reviews
        WHERE ($1 = '' OR state = $1)
          AND ($2 = '' OR reviewer_id = $2::uuid)
          AND ($3 = '' OR subject_id = $3::uuid)
          AND ($4 = '' OR order_id = $4::uuid)
          AND ($5 = '' OR service_code = $5)
          AND ($6 = '' OR market_code = $6)
        ORDER BY CASE WHEN state IN ('REPORTED','IN_REVIEW') THEN 0 ELSE 1 END, created_at DESC LIMIT $7`,
      [state, reviewerId, subjectId, orderId, serviceCode, marketCode, limitOf(req.query.limit)],
    );
    res.json({ success: true, data: result.rows, state: state || null });
  } catch (error: any) {
    securityLog.error('admin_reputation_reviews_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Reputation moderation queue unavailable' });
  }
};

export const moderateAdminReputationReview = async (req: Request, res: Response): Promise<void> => {
  const reviewId = String(req.params.id || '').trim();
  const state = String(req.body?.state || '').trim().toUpperCase();
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (!UUID_PATTERN.test(reviewId) || !['PUBLISHED', 'IN_REVIEW', 'HIDDEN'].includes(state) || !reason) {
    res.status(400).json({ success: false, error: 'review id, governed state, and reason are required' });
    return;
  }
  const actor = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id, subject_id, state FROM reputation_reviews WHERE id = $1 FOR UPDATE', [reviewId]);
    if (!current.rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'Review not found' }); return; }
    await client.query(
      `UPDATE reputation_reviews SET state = $2, moderation_reason = $3, updated_at = NOW() WHERE id = $1`,
      [reviewId, state, reason],
    );
    const action = state === 'HIDDEN' ? 'HIDE' : state === 'PUBLISHED' ? 'RESTORE' : 'REPORT';
    await client.query(
      `INSERT INTO reputation_actions (review_id, subject_id, action, reason, evidence_snapshot, rule_version, actor_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'admin-moderation-2026-09-12', $6)`,
      [reviewId, current.rows[0].subject_id, action, reason, JSON.stringify({ previous_state: current.rows[0].state, new_state: state }), actor],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'reputation.review.moderated', $2, $3::jsonb)`,
      [actor, reviewId, JSON.stringify({ previous_state: current.rows[0].state, state, reason })],
    );
    await client.query('COMMIT');
    res.json({ success: true, data: { id: reviewId, state, action } });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_reputation_moderation_failed', { error: error.message, review_id: reviewId });
    res.status(500).json({ success: false, error: 'Reputation moderation failed' });
  } finally { client.release(); }
};

export const upsertAdminReputationResponse = async (req: Request, res: Response): Promise<void> => {
  const reviewId = String(req.params.id || '').trim();
  const body = String(req.body?.body || '').trim().slice(0, 2000);
  const state = String(req.body?.state || 'PUBLISHED').trim().toUpperCase();
  if (!UUID_PATTERN.test(reviewId) || !body || !['PUBLISHED', 'HIDDEN'].includes(state)) {
    res.status(400).json({ success: false, error: 'review id, response body, and valid state are required' });
    return;
  }
  const actor = getActorId(req);
  try {
    const result = await db.query(
      `INSERT INTO reputation_review_responses (review_id, actor_id, body, state)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (review_id) DO UPDATE SET actor_id = EXCLUDED.actor_id,
         body = EXCLUDED.body, state = EXCLUDED.state, updated_at = NOW()
       RETURNING id, review_id, body, state, created_at, updated_at`,
      [reviewId, actor, body, state],
    );
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'reputation.review.response.updated', $2, $3::jsonb)`,
      [actor, reviewId, JSON.stringify({ state, body_length: body.length })],
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_reputation_response_failed', { error: error.message, review_id: reviewId });
    res.status(error?.code === '23503' ? 404 : 500).json({ success: false, error: error?.code === '23503' ? 'Review not found' : 'Reputation response failed' });
  }
};

export const listAdminCrmControlPlane = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [campaigns, loyalty, exceptions] = await Promise.all([
      readDb.query(`SELECT id, campaign_code, market_code, state, audience_definition, budget_minor, funding_breakdown, frequency_cap, holdout_percent, starts_at, ends_at, created_by, approved_by, created_at, updated_at FROM crm_campaigns ORDER BY updated_at DESC LIMIT 100`),
      readDb.query(`SELECT market_code, COUNT(*)::int AS accounts, COALESCE(SUM(points_balance), 0)::bigint AS points_outstanding FROM loyalty_accounts GROUP BY market_code ORDER BY market_code`),
      readDb.query(`SELECT id, source_type, source_id, expected_minor, actual_minor, difference_minor, reason, state, created_at FROM crm_reconciliation_exceptions WHERE state IN ('OPEN','IN_REVIEW') ORDER BY created_at DESC LIMIT 100`),
    ]);
    res.json({ success: true, data: { campaigns: campaigns.rows, loyalty: loyalty.rows, exceptions: exceptions.rows } });
  } catch (error: any) {
    securityLog.error('admin_crm_control_plane_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'CRM control plane unavailable' });
  }
};

export const createAdminCrmCampaign = async (req: Request, res: Response): Promise<void> => {
  const campaignCode = String(req.body?.campaign_code || '').trim().toLowerCase().slice(0, 80);
  const marketCode = String(req.body?.market_code || '').trim().toLowerCase().slice(0, 32);
  const budget = Number(req.body?.budget_minor ?? 0);
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(campaignCode) || !marketCode || !Number.isSafeInteger(budget) || budget < 0) {
    res.status(400).json({ success: false, error: 'campaign_code, market_code, and non-negative integer budget are required' });
    return;
  }
  const actor = getActorId(req);
  try {
    const result = await db.query(
      `INSERT INTO crm_campaigns (campaign_code, market_code, audience_definition, budget_minor, funding_breakdown, frequency_cap, holdout_percent, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb, $7, $8)
       RETURNING id, campaign_code, market_code, state, budget_minor, holdout_percent, created_at`,
      [campaignCode, marketCode, JSON.stringify(jsonObject(req.body?.audience_definition)), budget, JSON.stringify(jsonObject(req.body?.funding_breakdown)), JSON.stringify(jsonObject(req.body?.frequency_cap)), Math.min(Math.max(Number(req.body?.holdout_percent ?? 0), 0), 100), actor],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_crm_campaign_create_failed', { error: error.message, campaign_code: campaignCode });
    res.status(error?.code === '23505' ? 409 : 500).json({ success: false, error: error?.code === '23505' ? 'Campaign code already exists' : 'Campaign creation failed' });
  }
};

export const updateAdminCrmCampaignState = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id || '').trim();
  const state = String(req.body?.state || '').trim().toUpperCase();
  if (!UUID_PATTERN.test(id) || !['PENDING_APPROVAL', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'STOPPED', 'COMPLETED'].includes(state)) {
    res.status(400).json({ success: false, error: 'Invalid campaign state' });
    return;
  }
  const actor = getActorId(req);
  try {
    const result = await db.query(
      `UPDATE crm_campaigns SET state = $2, approved_by = CASE WHEN $2 IN ('SCHEDULED','ACTIVE') THEN $3 ELSE approved_by END, updated_at = NOW()
        WHERE id = $1 RETURNING id, campaign_code, state, approved_by, updated_at`,
      [id, state, actor],
    );
    if (!result.rows[0]) { res.status(404).json({ success: false, error: 'Campaign not found' }); return; }
    await db.query(`INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'crm.campaign.state_updated', $2, $3::jsonb)`, [actor, id, JSON.stringify({ state })]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_crm_campaign_state_failed', { error: error.message, campaign_id: id });
    res.status(500).json({ success: false, error: 'Campaign state update failed' });
  }
};
