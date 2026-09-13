import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import { moderateReview, REPUTATION_REPORT_CATEGORIES, validateReview } from '../services/reputationPolicy';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPLETED_ORDER_STATES = ['delivered', 'completed', 'pod_completed'];
const MAX_REVIEW_BODY = 2000;

const jsonObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const normalizedDimensions = (value: unknown): Record<string, number> => {
  const allowed = new Set(['service', 'delivery', 'merchant', 'courier', 'communication']);
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(jsonObject(value))) {
    if (!allowed.has(key)) continue;
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isInteger(parsed)) result[key] = parsed;
  }
  return result;
};

const reviewInput = (req: Request) => {
  const actor = getActorId(req);
  const orderId = String(req.body?.order_id || '').trim();
  const subjectId = String(req.body?.subject_id || '').trim();
  const stars = Number(req.body?.stars);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, MAX_REVIEW_BODY) : null;
  const marketCode = String(req.body?.market_code || req.header('x-market-code') || '').trim().toLowerCase();
  return { actor, orderId, subjectId, stars, body, marketCode, dimensions: normalizedDimensions(req.body?.dimensions) };
};

/**
 * Customer/courier review creation. The caller supplies only the completed
 * order and intended actor; eligibility is derived from orders/order_legs and
 * merchant ownership, never from a client-provided completion flag.
 */
export const createReputationReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = reviewInput(req);
    if (!UUID_PATTERN.test(input.orderId) || !UUID_PATTERN.test(input.subjectId) || !Number.isInteger(input.stars) || !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(input.marketCode)) {
      res.status(400).json({ success: false, code: 'ERR_INVALID_REPUTATION_REVIEW' });
      return;
    }

    const orderResult = await readDb.query(
      `SELECT o.id, o.customer_id, o.service_code, o.status,
              EXISTS (
                SELECT 1 FROM order_legs ol
                 WHERE ol.order_id = o.id AND ol.courier_id = $3
              ) AS subject_is_courier,
              EXISTS (
                SELECT 1 FROM merchants m
                 WHERE m.id = o.merchant_id AND m.user_id = $3
              ) AS subject_is_merchant
         FROM orders o
        WHERE o.id = $1 AND o.customer_id = $2
        LIMIT 1`,
      [input.orderId, input.actor, input.subjectId],
    );
    const order = orderResult.rows[0];
    if (!order || !COMPLETED_ORDER_STATES.includes(String(order.status).toLowerCase())) {
      res.status(409).json({ success: false, code: 'ERR_REPUTATION_ORDER_NOT_ELIGIBLE' });
      return;
    }
    if (input.actor === input.subjectId || (!order.subject_is_courier && !order.subject_is_merchant)) {
      res.status(403).json({ success: false, code: 'ERR_REPUTATION_SUBJECT_NOT_ELIGIBLE' });
      return;
    }

    const serviceCode = String(order.service_code || 'delivery').trim().toLowerCase();
    const errors = validateReview({
      reviewerId: input.actor,
      subjectId: input.subjectId,
      orderId: input.orderId,
      serviceCode,
      state: String(order.status).toLowerCase() as 'completed',
      stars: input.stars,
      dimensions: input.dimensions,
    }, new Set());
    if (errors.length) {
      res.status(400).json({ success: false, code: 'ERR_INVALID_REPUTATION_REVIEW', errors });
      return;
    }

    const moderation = moderateReview(input.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO reputation_reviews
          (reviewer_id, subject_id, order_id, service_code, market_code, stars,
           dimensions, body, state, moderation_reason, quality_rule_version,
           source_type, confidence, signal_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, 'customer_review', $12, 'reputation-v1')
         RETURNING id, reviewer_id, subject_id, order_id, service_code, market_code,
                   stars, dimensions, body, state, moderation_reason,
                   quality_rule_version, source_type, confidence, signal_version,
                   created_at`,
        [
          input.actor,
          input.subjectId,
          input.orderId,
          serviceCode,
          input.marketCode,
          input.stars,
          JSON.stringify(input.dimensions),
          input.body,
          moderation.state,
          moderation.reasons.length ? moderation.reasons.join(',') : null,
          'quality-2026-09-12',
          moderation.state === 'PUBLISHED' ? 1 : 0.5,
        ],
      );
      if (moderation.reasons.length) {
        await client.query(
        `INSERT INTO reputation_actions
          (review_id, subject_id, action, reason, evidence_snapshot, rule_version, actor_id)
         VALUES ($1, $2, 'REPORT', $3, $4::jsonb, 'review-moderation-2026-09-13', $5)`,
          [
            result.rows[0].id,
            input.subjectId,
            'Automated review signal routed to moderation; no permanent enforcement applied',
            JSON.stringify({
              source_type: 'customer_review',
              signal_version: 'reputation-v1',
              moderation_reasons: moderation.reasons,
              temporary_investigation: true,
            }),
            input.actor,
          ],
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ success: false, code: 'ERR_REPUTATION_DUPLICATE' });
      return;
    }
    securityLog.error('create_reputation_review_failed', { error: error?.message });
    res.status(500).json({ success: false, code: 'ERR_REPUTATION_UNAVAILABLE' });
  }
};

/** A reporter can move a published review into the moderation queue. */
export const reportReputationReview = async (req: Request, res: Response): Promise<void> => {
  const reviewId = String(req.params.id || '').trim();
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  const category = String(req.body?.category || 'OTHER').trim().toUpperCase();
  if (!UUID_PATTERN.test(reviewId) || !reason || !REPUTATION_REPORT_CATEGORIES.includes(category as typeof REPUTATION_REPORT_CATEGORIES[number])) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_REPUTATION_REPORT' });
    return;
  }
  const actor = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id, reviewer_id, subject_id, state
         FROM reputation_reviews WHERE id = $1 FOR UPDATE`,
      [reviewId],
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, code: 'ERR_REPUTATION_NOT_FOUND' });
      return;
    }
    const review = current.rows[0];
    if (actor !== review.reviewer_id && actor !== review.subject_id) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, code: 'ERR_REPUTATION_REPORT_FORBIDDEN' });
      return;
    }
    const nextState = review.state === 'HIDDEN' ? 'HIDDEN' : 'REPORTED';
    await client.query(
      `UPDATE reputation_reviews
          SET state = $2, updated_at = NOW()
        WHERE id = $1 AND state <> 'HIDDEN'`,
      [reviewId, nextState],
    );
    await client.query(
      `INSERT INTO reputation_actions
        (review_id, subject_id, action, reason, evidence_snapshot, rule_version, actor_id)
       VALUES ($1, $2, 'REPORT', $3, $4::jsonb, 'moderation-2026-09-12', $5)`,
      [reviewId, review.subject_id, reason, JSON.stringify({ reporter_role: actor === review.subject_id ? 'subject' : 'reviewer', category }), actor],
    );
    await client.query('COMMIT');
    res.json({ success: true, data: { id: reviewId, state: nextState } });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('report_reputation_review_failed', { error: error?.message, review_id: reviewId });
    res.status(500).json({ success: false, code: 'ERR_REPUTATION_REPORT_UNAVAILABLE' });
  } finally {
    client.release();
  }
};

export const submitReputationAppeal = async (req: Request, res: Response): Promise<void> => {
  const reviewId = String(req.params.id || '').trim();
  const reason = String(req.body?.reason || '').trim().slice(0, 2000);
  if (!UUID_PATTERN.test(reviewId) || reason.length < 10) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_REPUTATION_APPEAL' });
    return;
  }
  const actor = getActorId(req);
  try {
    const review = await readDb.query(
      `SELECT id, subject_id, state FROM reputation_reviews
        WHERE id = $1 AND (reviewer_id = $2 OR subject_id = $2) LIMIT 1`,
      [reviewId, actor],
    );
    if (!review.rows[0]) {
      res.status(404).json({ success: false, code: 'ERR_REPUTATION_NOT_FOUND' });
      return;
    }
    if (String(review.rows[0].state) === 'PUBLISHED') {
      res.status(409).json({ success: false, code: 'ERR_REPUTATION_APPEAL_NOT_NEEDED' });
      return;
    }
    const existing = await readDb.query(
      `SELECT id FROM reputation_appeals WHERE review_id = $1 AND state IN ('SUBMITTED','IN_REVIEW') LIMIT 1`,
      [reviewId],
    );
    if (existing.rows[0]) {
      res.status(409).json({ success: false, code: 'ERR_REPUTATION_APPEAL_ALREADY_OPEN' });
      return;
    }
    const result = await db.query(
      `INSERT INTO reputation_appeals (review_id, subject_id, submitted_reason)
       VALUES ($1, $2, $3)
       RETURNING id, review_id, state, submitted_reason, created_at`,
      [reviewId, review.rows[0].subject_id, reason],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('submit_reputation_appeal_failed', { error: error?.message, review_id: reviewId });
    res.status(500).json({ success: false, code: 'ERR_REPUTATION_APPEAL_UNAVAILABLE' });
  }
};

export const listAdminReputationAppeals = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(
      `SELECT a.id, a.review_id, a.subject_id, a.state, a.submitted_reason,
              a.reviewer_id, a.outcome_reason, a.created_at, a.reviewed_at,
              r.reviewer_id AS review_author_id, r.stars, r.service_code, r.market_code, r.state AS review_state
         FROM reputation_appeals a
         JOIN reputation_reviews r ON r.id = a.review_id
        WHERE a.state IN ('SUBMITTED','IN_REVIEW')
        ORDER BY a.created_at ASC LIMIT 100`,
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('list_admin_reputation_appeals_failed', { error: error?.message });
    res.status(500).json({ success: false, code: 'ERR_REPUTATION_APPEALS_UNAVAILABLE' });
  }
};

export const reviewAdminReputationAppeal = async (req: Request, res: Response): Promise<void> => {
  const appealId = String(req.params.appealId || '').trim();
  const state = String(req.body?.state || '').trim().toUpperCase();
  const reason = String(req.body?.reason || '').trim().slice(0, 2000);
  if (!UUID_PATTERN.test(appealId) || !['IN_REVIEW', 'UPHELD', 'REVERSED', 'REJECTED'].includes(state) || reason.length < 10) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_REPUTATION_APPEAL_REVIEW' });
    return;
  }
  const actor = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT a.id, a.review_id, a.subject_id, a.state AS appeal_state,
              r.state AS review_state, r.service_code, r.market_code
         FROM reputation_appeals a
         JOIN reputation_reviews r ON r.id = a.review_id
        WHERE a.id = $1 AND a.state IN ('SUBMITTED','IN_REVIEW')
        FOR UPDATE OF a, r`,
      [appealId],
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, code: 'ERR_REPUTATION_APPEAL_NOT_FOUND' });
      return;
    }
    const appeal = current.rows[0];
    await client.query(
      `UPDATE reputation_appeals
          SET state = $2, reviewer_id = $3, outcome_reason = $4, reviewed_at = NOW()
        WHERE id = $1`,
      [appealId, state, actor, reason],
    );
    if (state === 'REVERSED') {
      await client.query(
        `UPDATE reputation_reviews
            SET state = 'PUBLISHED', moderation_reason = NULL, updated_at = NOW()
          WHERE id = $1 AND state IN ('HIDDEN','REPORTED','IN_REVIEW')`,
        [appeal.review_id],
      );
      const recomputedSnapshot = await client.query(
        `INSERT INTO reputation_signal_snapshots
          (subject_id, service_code, market_code, window_start, window_end, signal_version, aggregate)
         SELECT $1, $2, $3, DATE_TRUNC('day', NOW()), NOW(), 'reputation-v2',
                jsonb_build_object(
                  'sample_size', COUNT(*)::int,
                  'average_stars', ROUND(AVG(stars)::numeric, 2),
                  'service_average', ROUND(AVG(CASE WHEN dimensions->>'service' ~ '^[1-5]$' THEN (dimensions->>'service')::numeric END), 2),
                  'delivery_average', ROUND(AVG(CASE WHEN dimensions->>'delivery' ~ '^[1-5]$' THEN (dimensions->>'delivery')::numeric END), 2),
                  'recomputed_from', 'published_reviews_after_appeal',
                  'appeal_id', $4,
                  'rule_version', 'reputation-v2'
                )
           FROM reputation_reviews
          WHERE subject_id = $1 AND service_code = $2 AND market_code = $3 AND state = 'PUBLISHED'
         RETURNING id`,
        [appeal.subject_id, appeal.service_code, appeal.market_code, appealId],
      );
      await client.query(
        `INSERT INTO reputation_actions
          (review_id, subject_id, action, reason, evidence_snapshot, rule_version, actor_id)
         VALUES ($1, $2, 'APPEAL_REVERSE', $3, $4::jsonb, 'moderation-2026-09-12', $5)`,
        [
          appeal.review_id,
          appeal.subject_id,
          reason,
          JSON.stringify({
            previous_review_state: appeal.review_state,
            appeal_id: appealId,
            recomputed_snapshot_id: recomputedSnapshot.rows[0]?.id || null,
            recomputed_signal_version: 'reputation-v2',
          }),
          actor,
        ],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload)
         VALUES ($1, 'reputation.aggregate.recomputed', $2, $3::jsonb)`,
        [actor, appeal.review_id, JSON.stringify({ appeal_id: appealId, snapshot_id: recomputedSnapshot.rows[0]?.id || null, signal_version: 'reputation-v2' })],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'reputation.appeal.reviewed', $2, $3::jsonb)`,
      [actor, appealId, JSON.stringify({ review_id: appeal.review_id, state, reason_length: reason.length })],
    );
    await client.query('COMMIT');
    res.json({
      success: true,
      data: {
        id: appealId,
        state,
        review_republished: state === 'REVERSED',
        aggregate_recomputed: state === 'REVERSED',
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('review_admin_reputation_appeal_failed', { error: error?.message, appeal_id: appealId });
    res.status(500).json({ success: false, code: 'ERR_REPUTATION_APPEAL_REVIEW_UNAVAILABLE' });
  } finally {
    client.release();
  }
};

/** Public aggregate deliberately hides small samples and moderation reasons. */
export const getPublicReputationAggregate = async (req: Request, res: Response): Promise<void> => {
  const subjectId = String(req.params.subjectId || '').trim();
  const serviceCode = String(req.query.service_code || '').trim().toLowerCase();
  const marketCode = String(req.query.market_code || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(subjectId)) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_REPUTATION_SUBJECT' });
    return;
  }
  try {
    const result = await readDb.query(
      `SELECT COUNT(*)::int AS sample_size,
              ROUND(AVG(stars)::numeric, 2)::float8 AS average_stars,
              ROUND(AVG(CASE WHEN dimensions->>'service' ~ '^[1-5]$' THEN (dimensions->>'service')::numeric END), 2)::float8 AS service_average,
              ROUND(AVG(CASE WHEN dimensions->>'delivery' ~ '^[1-5]$' THEN (dimensions->>'delivery')::numeric END), 2)::float8 AS delivery_average
         FROM reputation_reviews
        WHERE subject_id = $1 AND state = 'PUBLISHED'
          AND ($2 = '' OR service_code = $2)
          AND ($3 = '' OR market_code = $3)`,
      [subjectId, serviceCode, marketCode],
    );
    const row = result.rows[0] || { sample_size: 0 };
    const sampleSize = Number(row.sample_size || 0);
    const visible = sampleSize >= 5;
    res.json({
      success: true,
      data: {
        visible,
        sample_size: sampleSize,
        average_stars: visible ? row.average_stars : null,
        dimensions: visible ? { service: row.service_average, delivery: row.delivery_average } : {},
        aggregate_visibility_reason: visible
          ? 'PUBLISHED_SAMPLE_MEETS_PRIVACY_THRESHOLD'
          : 'PUBLISHED_SAMPLE_BELOW_PRIVACY_THRESHOLD',
      },
    });
  } catch (error: any) {
    securityLog.error('get_public_reputation_aggregate_failed', { error: error?.message, subject_id: subjectId });
    res.status(500).json({ success: false, code: 'ERR_REPUTATION_UNAVAILABLE' });
  }
};

/** Merchant response is scoped to the merchant owning the completed order. */
export const upsertMerchantReputationResponse = async (req: Request, res: Response): Promise<void> => {
  const reviewId = String(req.params.id || '').trim();
  const body = String(req.body?.body || '').trim().slice(0, 2000);
  if (!UUID_PATTERN.test(reviewId) || !body) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_REPUTATION_RESPONSE' });
    return;
  }
  const actor = getActorId(req);
  try {
    const ownership = await readDb.query(
      `SELECT rr.id
         FROM reputation_reviews rr
         JOIN orders o ON o.id = rr.order_id
         JOIN merchants m ON m.id = o.merchant_id
        WHERE rr.id = $1 AND m.user_id = $2
        LIMIT 1`,
      [reviewId, actor],
    );
    if (!ownership.rows[0]) {
      res.status(403).json({ success: false, code: 'ERR_REPUTATION_RESPONSE_FORBIDDEN' });
      return;
    }
    const result = await db.query(
      `INSERT INTO reputation_review_responses (review_id, actor_id, body, state)
       VALUES ($1, $2, $3, 'PUBLISHED')
       ON CONFLICT (review_id) DO UPDATE SET actor_id = EXCLUDED.actor_id,
         body = EXCLUDED.body, state = 'PUBLISHED', updated_at = NOW()
       RETURNING id, review_id, actor_id, body, state, created_at, updated_at`,
      [reviewId, actor, body],
    );
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'reputation.merchant_response.updated', $2, $3::jsonb)`,
      [actor, reviewId, JSON.stringify({ body_length: body.length })],
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('upsert_merchant_reputation_response_failed', { error: error?.message, review_id: reviewId });
    res.status(500).json({ success: false, code: 'ERR_REPUTATION_RESPONSE_UNAVAILABLE' });
  }
};
