import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import { requestPaymentConfigChange } from './paymentConfigApproval.controller';
import { validateCampaignAudience, validateCampaignFinancialContract, validateCampaignFundingBreakdown, validateCampaignFrequencyCap } from '../services/crmPolicy';
import { activateDueCrmCampaigns } from '../services/crmCampaignScheduler.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const limitOf = (value: unknown, fallback = 50) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 250) : fallback;
};
const jsonObject = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const reviewedEvidenceRefs = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20)
    : []
);

const internalKeyMatches = (req: Request) => {
  const expected = String(process.env.INTERNAL_API_KEY || '').trim();
  const provided = String(req.header('x-internal-api-key') || '').trim();
  return Boolean(expected && provided && expected.length === provided.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided)));
};

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
  await requestPaymentConfigChange(req, res, 'METHOD_CATALOG');
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
      `SELECT pc.id, pc.intent_id, pi.order_id, pc.provider, pc.provider_case_reference,
              pc.amount_minor, pc.currency, pc.state, pc.evidence_deadline,
              pc.liability_owner, pc.created_at, pc.updated_at,
              COALESCE((SELECT ARRAY_AGG(scl.case_id ORDER BY scl.created_at ASC)
                          FROM support_case_links scl
                         WHERE scl.reference_type = 'chargeback'
                           AND scl.reference_id = pc.id::text), ARRAY[]::uuid[]) AS support_case_ids
         FROM payment_chargebacks pc
         LEFT JOIN payment_intents pi ON pi.id = pc.intent_id
        WHERE ($1 = '' OR pc.state = $1)
        ORDER BY CASE WHEN pc.evidence_deadline IS NULL THEN 1 ELSE 0 END,
                 pc.evidence_deadline ASC NULLS LAST, pc.updated_at DESC LIMIT $2`,
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
  await requestPaymentConfigChange(req, res, 'PROVIDER_HEALTH');
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
              dimensions, body, state, moderation_reason, quality_rule_version, created_at, updated_at,
              (SELECT COUNT(*)::int FROM reputation_reviews aggregate_reviews
                WHERE aggregate_reviews.subject_id = reputation_reviews.subject_id
                  AND aggregate_reviews.service_code = reputation_reviews.service_code
                  AND aggregate_reviews.market_code = reputation_reviews.market_code
                  AND aggregate_reviews.state = 'PUBLISHED') AS published_sample_size,
              CASE WHEN (SELECT COUNT(*) FROM reputation_reviews aggregate_reviews
                          WHERE aggregate_reviews.subject_id = reputation_reviews.subject_id
                            AND aggregate_reviews.service_code = reputation_reviews.service_code
                            AND aggregate_reviews.market_code = reputation_reviews.market_code
                            AND aggregate_reviews.state = 'PUBLISHED') >= 5
                   THEN 'PUBLISHED_SAMPLE_MEETS_PRIVACY_THRESHOLD'
                   ELSE 'PUBLISHED_SAMPLE_BELOW_PRIVACY_THRESHOLD'
              END AS aggregate_visibility_reason,
              CASE WHEN COUNT(*) OVER (PARTITION BY reviewer_id, stars) >= 3
                         OR COUNT(*) OVER (PARTITION BY subject_id, stars) >= 3
                   THEN 'COORDINATED_RATING_SIGNAL'
                   ELSE NULL
              END AS rating_abuse_signal
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
  const evidenceRefs = reviewedEvidenceRefs(req.body?.reviewed_evidence_refs);
  if (!UUID_PATTERN.test(reviewId) || !['PUBLISHED', 'IN_REVIEW', 'HIDDEN'].includes(state) || !reason || (state === 'HIDDEN' && evidenceRefs.length === 0)) {
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
      [reviewId, current.rows[0].subject_id, action, reason, JSON.stringify({ previous_state: current.rows[0].state, new_state: state, evidence_review_status: state === 'HIDDEN' ? 'REVIEWED' : 'NOT_REQUIRED', reviewed_evidence_refs: evidenceRefs, temporary_until_reviewed: state === 'IN_REVIEW' }), actor],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'reputation.review.moderated', $2, $3::jsonb)`,
      [actor, reviewId, JSON.stringify({ previous_state: current.rows[0].state, state, reason, reviewed_evidence_refs: evidenceRefs })],
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
    const [campaigns, loyalty, exceptions, referrals, memberships, loyaltyAccounts] = await Promise.all([
      readDb.query(`SELECT id, campaign_code, market_code, state, audience_definition, budget_minor, budget_version, merchant_agreement_version, promo_subsidy_minor, ads_spend_minor, guardrail_policy, funding_breakdown, frequency_cap, holdout_percent, starts_at, ends_at, created_by, approved_by, created_at, updated_at FROM crm_campaigns ORDER BY updated_at DESC LIMIT 100`),
      readDb.query(`SELECT market_code, COUNT(*)::int AS accounts, COALESCE(SUM(points_balance), 0)::bigint AS points_outstanding FROM loyalty_accounts GROUP BY market_code ORDER BY market_code`),
      readDb.query(`SELECT id, source_type, source_id, expected_minor, actual_minor, difference_minor, reason, state, created_at FROM crm_reconciliation_exceptions WHERE state IN ('OPEN','IN_REVIEW') ORDER BY created_at DESC LIMIT 100`),
      readDb.query(`SELECT market_code, status, COUNT(*)::int AS attributions, COALESCE(SUM(reward_liability_minor), 0)::bigint AS reward_liability_minor FROM crm_referral_attributions GROUP BY market_code, status ORDER BY market_code, status`),
      readDb.query(`SELECT p.market_code, e.state, COUNT(*)::int AS entitlements, COALESCE(SUM(p.price_minor), 0)::bigint AS plan_value_minor FROM crm_membership_entitlements e JOIN crm_membership_plans p ON p.id = e.plan_id GROUP BY p.market_code, e.state ORDER BY p.market_code, e.state`),
      readDb.query(`SELECT id, owner_id, market_code, points_balance, updated_at FROM loyalty_accounts ORDER BY updated_at DESC LIMIT 100`),
    ]);
    res.json({ success: true, data: { campaigns: campaigns.rows, loyalty: loyalty.rows, loyalty_accounts: loyaltyAccounts.rows, exceptions: exceptions.rows, referrals: referrals.rows, memberships: memberships.rows } });
  } catch (error: any) {
    securityLog.error('admin_crm_control_plane_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'CRM control plane unavailable' });
  }
};

export const createAdminCrmCampaign = async (req: Request, res: Response): Promise<void> => {
  const campaignCode = String(req.body?.campaign_code || '').trim().toLowerCase().slice(0, 80);
  const marketCode = String(req.body?.market_code || '').trim().toLowerCase().slice(0, 32);
  const budget = Number(req.body?.budget_minor ?? 0);
  const startsAtRaw = req.body?.starts_at == null ? null : String(req.body.starts_at).trim();
  const endsAtRaw = req.body?.ends_at == null ? null : String(req.body.ends_at).trim();
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(campaignCode) || !marketCode || !Number.isSafeInteger(budget) || budget < 0) {
    res.status(400).json({ success: false, error: 'campaign_code, market_code, and non-negative integer budget are required' });
    return;
  }
  if ((startsAtRaw && Number.isNaN(startsAt?.getTime())) || (endsAtRaw && Number.isNaN(endsAt?.getTime())) || (startsAt && endsAt && endsAt <= startsAt)) {
    res.status(400).json({ success: false, error: 'starts_at/ends_at must be valid instants with ends_at after starts_at' });
    return;
  }
  const audience = validateCampaignAudience(req.body?.audience_definition);
  const frequencyCap = validateCampaignFrequencyCap(req.body?.frequency_cap);
  const funding = validateCampaignFundingBreakdown(req.body?.funding_breakdown, budget);
  const financial = validateCampaignFinancialContract(req.body, budget, funding.normalized);
  if (audience.normalized.market_code !== undefined && String(audience.normalized.market_code).trim().toLowerCase() !== marketCode) {
    audience.errors.push('audience_market_must_match_campaign_market');
    audience.valid = false;
  }
  if (!audience.valid || !frequencyCap.valid || !funding.valid || !financial.valid) {
    res.status(400).json({
      success: false,
      error: 'Campaign audience or frequency cap is not governed',
      details: [...audience.errors, ...frequencyCap.errors, ...funding.errors, ...financial.errors],
    });
    return;
  }
  const actor = getActorId(req);
  try {
    const result = await db.query(
      `INSERT INTO crm_campaigns (campaign_code, market_code, audience_definition, budget_minor, budget_version, merchant_agreement_version, promo_subsidy_minor, ads_spend_minor, guardrail_policy, funding_breakdown, frequency_cap, holdout_percent, created_by, starts_at, ends_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15)
       RETURNING id, campaign_code, market_code, state, budget_minor, budget_version, promo_subsidy_minor, ads_spend_minor, holdout_percent, starts_at, ends_at, created_at`,
      [campaignCode, marketCode, JSON.stringify(audience.normalized), budget, financial.normalized.budget_version, financial.normalized.merchant_agreement_version || null, financial.normalized.promo_subsidy_minor, financial.normalized.ads_spend_minor, JSON.stringify(financial.normalized.guardrail_policy), JSON.stringify(funding.normalized), JSON.stringify(frequencyCap.normalized), Math.min(Math.max(Number(req.body?.holdout_percent ?? 0), 0), 100), actor, startsAt, endsAt],
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
  const actorRole = String(req.user?.role || '').trim().toLowerCase();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{ state: string; starts_at: Date | string | null; ends_at: Date | string | null }>(
      `SELECT state, starts_at, ends_at FROM crm_campaigns WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }
    const currentState = String(current.rows[0].state || '').toUpperCase();
    const currentStartsAt = current.rows[0].starts_at ? new Date(current.rows[0].starts_at) : null;
    const currentEndsAt = current.rows[0].ends_at ? new Date(current.rows[0].ends_at) : null;
    if (state === 'SCHEDULED' && (!currentStartsAt || Number.isNaN(currentStartsAt.getTime()) || (currentEndsAt && currentEndsAt <= currentStartsAt))) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Scheduled campaign requires a valid future window' });
      return;
    }
    if (state === 'ACTIVE' && currentStartsAt && currentStartsAt > new Date()) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Campaign cannot activate before starts_at; use SCHEDULED' });
      return;
    }
    const publicationAllowed = state === 'SCHEDULED'
      ? currentState === 'PENDING_APPROVAL'
      : state === 'ACTIVE'
        ? ['PENDING_APPROVAL', 'SCHEDULED'].includes(currentState)
        : true;
    if (['SCHEDULED', 'ACTIVE'].includes(state) && (actorRole !== 'super_admin' || !publicationAllowed)) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, error: 'Campaign publication requires super_admin approval from an approved workflow state' });
      return;
    }
    const result = await client.query(
      `UPDATE crm_campaigns SET state = $2, approved_by = CASE WHEN $2 IN ('SCHEDULED','ACTIVE') THEN $3 ELSE approved_by END, updated_at = NOW()
        WHERE id = $1 RETURNING id, campaign_code, state, approved_by, updated_at`,
      [id, state, actor],
    );
    await client.query(`INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, 'crm.campaign.state_updated', $2, $3::jsonb)`, [actor, id, JSON.stringify({ from_state: currentState, state, actor_role: actorRole })]);
    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_crm_campaign_state_failed', { error: error.message, campaign_id: id });
    res.status(500).json({ success: false, error: 'Campaign state update failed' });
  } finally {
    client.release();
  }
};

/** Internal scheduler boundary. It is the only non-Admin actor allowed to
 * activate an already approved scheduled CRM campaign. */
export const activateDueAdminCrmCampaigns = async (req: Request, res: Response): Promise<void> => {
  if (!internalKeyMatches(req)) {
    res.status(401).json({ success: false, code: 'ERR_INTERNAL_UNAUTHORIZED' });
    return;
  }
  try {
    res.json({ success: true, data: await activateDueCrmCampaigns() });
  } catch (error: any) {
    securityLog.error('admin_crm_campaign_scheduler_failed', { error: error?.message });
    res.status(500).json({ success: false, error: 'CRM campaign scheduler unavailable' });
  }
};
