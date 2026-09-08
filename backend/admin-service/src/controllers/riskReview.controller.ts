import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';

const RISK_DECISIONS = ['ALLOW', 'CHALLENGE', 'REVIEW', 'HOLD', 'BLOCK'] as const;
const REVIEW_STATUSES = ['PENDING', 'RESOLVED', 'CANCELLED'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const listQuery = (req: Request) => {
  const status = String(req.query.status || '').trim().toUpperCase();
  const decision = String(req.query.decision || '').trim().toUpperCase();
  const parsedLimit = Number.parseInt(String(req.query.limit || '50'), 10);
  return {
    status: REVIEW_STATUSES.includes(status as (typeof REVIEW_STATUSES)[number]) ? status : '',
    decision: RISK_DECISIONS.includes(decision as (typeof RISK_DECISIONS)[number]) ? decision : '',
    limit: Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 250) : 50,
  };
};

const reviewSelect = `
  SELECT mr.id, mr.risk_decision_id, mr.status AS review_status, mr.evidence AS review_evidence,
         mr.reviewer_id, mr.decision AS manual_decision, mr.reason AS manual_reason,
         mr.reviewed_at, mr.created_at, mr.updated_at,
         rd.operation, rd.market_code, rd.entity_type, rd.entity_id, rd.decision,
         rd.risk_score, rd.reason_codes, rd.signal_snapshot, rd.policy_version,
         rd.failure_mode, rd.correlation_id, rd.created_at AS decision_created_at
  FROM risk_manual_reviews mr
  JOIN risk_decisions rd ON rd.id = mr.risk_decision_id`;

export const listRiskReviews = async (req: Request, res: Response): Promise<void> => {
  const { status, decision, limit } = listQuery(req);
  try {
    const result = await readDb.query(
      `${reviewSelect}
       WHERE ($1 = '' OR mr.status = $1)
         AND ($2 = '' OR rd.decision = $2)
       ORDER BY CASE WHEN mr.status = 'PENDING' THEN 0 ELSE 1 END, mr.created_at ASC
       LIMIT $3`,
      [status, decision, limit],
    );
    res.json({ data: result.rows, total: result.rows.length, status: status || null, decision: decision || null, limit });
  } catch (error: any) {
    securityLog.error('admin_risk_review_list_failed', { error: error.message });
    res.status(500).json({ error: 'Failed to load risk review queue' });
  }
};

export const getRiskReview = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id || '').trim();
  if (!UUID_PATTERN.test(id)) {
    res.status(400).json({ error: 'Invalid risk review id' });
    return;
  }
  try {
    const result = await readDb.query(`${reviewSelect} WHERE mr.id = $1`, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Risk review not found' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_risk_review_detail_failed', { error: error.message, reviewId: id });
    res.status(500).json({ error: 'Failed to load risk review' });
  }
};

const safeEvidence = (body: any) => {
  const summary = typeof body?.summary === 'string' ? body.summary.trim().slice(0, 2000) : '';
  const source = typeof body?.source === 'string' ? body.source.trim().slice(0, 64) : 'admin_review';
  const references = Array.isArray(body?.references)
    ? body.references.filter((value: unknown): value is string => typeof value === 'string').map((value: string) => value.trim().slice(0, 200)).filter(Boolean).slice(0, 20)
    : [];
  return { summary, source: source || 'admin_review', references };
};

export const resolveRiskReview = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id || '').trim();
  const decision = String(req.body?.decision || '').trim().toUpperCase();
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
  const evidence = safeEvidence(req.body?.evidence);
  if (!UUID_PATTERN.test(id)) {
    res.status(400).json({ error: 'Invalid risk review id' });
    return;
  }
  if (!RISK_DECISIONS.includes(decision as (typeof RISK_DECISIONS)[number])) {
    res.status(400).json({ error: `decision must be one of ${RISK_DECISIONS.join(', ')}` });
    return;
  }
  if (!reason) {
    res.status(400).json({ error: 'reason is required for a risk review decision' });
    return;
  }

  let client: PoolClient | undefined;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT id, risk_decision_id, status FROM risk_manual_reviews WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Risk review not found' });
      return;
    }
    if (current.rows[0].status !== 'PENDING') {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Risk review has already been resolved', status: current.rows[0].status });
      return;
    }

    const actorId = getActorId(req);
    await client.query(
      `UPDATE risk_manual_reviews
       SET status = 'RESOLVED', evidence = evidence || $2::jsonb,
           reviewer_id = $3::uuid, decision = $4, reason = $5,
           reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify({ reviewer_submission: evidence }), actorId, decision, reason],
    );
    await client.query(
      `UPDATE risk_decisions
       SET decision = $1,
           reason_codes = CASE WHEN $2 = ANY(reason_codes) THEN reason_codes ELSE array_append(reason_codes, $2) END
       WHERE id = $3`,
      [decision, `manual_review.${decision.toLowerCase()}`, current.rows[0].risk_decision_id],
    );
    await client.query('COMMIT');
    res.json({ data: { id, status: 'RESOLVED', decision, reviewer_id: actorId, reason } });
  } catch (error: any) {
    await client?.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_risk_review_resolve_failed', { error: error.message, reviewId: id });
    res.status(500).json({ error: 'Failed to resolve risk review' });
  } finally {
    client?.release();
  }
};
