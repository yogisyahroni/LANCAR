import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

const RETRAINING_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;

export const listCourierRetention = async (req: Request, res: Response): Promise<void> => {
  const days = Math.min(Math.max(Number.parseInt(String(req.query.days || '30'), 10) || 30, 7), 180);
  try {
    const result = await readDb.query(
      `WITH order_stats AS (
         SELECT o.courier_id,
                MAX(o.updated_at) AS last_order_at,
                COUNT(*) FILTER (WHERE o.status = 'completed') AS completed_orders,
                COUNT(*) FILTER (WHERE o.status IN ('cancelled', 'rejected')) AS cancelled_orders
         FROM orders o
         WHERE o.updated_at >= NOW() - ($1::text || ' days')::interval
         GROUP BY o.courier_id
       ), latest_training AS (
         SELECT courier_profile_id, COUNT(*)::int AS training_count,
                MAX(completed_at) AS last_training_at
         FROM courier_training_completions
         GROUP BY courier_profile_id
       ), latest_retraining AS (
         SELECT DISTINCT ON (courier_profile_id) id, courier_profile_id, reason, status,
                scheduled_at, completed_at, notes, created_at
         FROM courier_retraining_actions
         ORDER BY courier_profile_id, created_at DESC
       )
       SELECT cp.id AS courier_profile_id, cp.user_id, u.full_name, u.email, u.phone,
              u.status AS user_status, cp.verification_status,
              COALESCE(os.completed_orders, 0)::int AS completed_orders,
              COALESCE(os.cancelled_orders, 0)::int AS cancelled_orders,
              os.last_order_at, COALESCE(lt.training_count, 0)::int AS training_count,
              lt.last_training_at, lr.id AS retraining_id, lr.reason AS retraining_reason,
              lr.status AS retraining_status, lr.scheduled_at, lr.completed_at,
              lr.notes AS retraining_notes
       FROM courier_profiles cp
       JOIN users u ON u.id = cp.user_id
       LEFT JOIN order_stats os ON os.courier_id = cp.user_id
       LEFT JOIN latest_training lt ON lt.courier_profile_id = cp.id
       LEFT JOIN latest_retraining lr ON lr.courier_profile_id = cp.id
       WHERE cp.verification_status = 'approved'
       ORDER BY (os.last_order_at IS NULL) DESC, os.last_order_at ASC NULLS FIRST,
                COALESCE(os.cancelled_orders, 0) DESC, u.full_name ASC
       LIMIT 500`,
      [days]
    );
    res.json({ days, couriers: result.rows });
  } catch (error: any) {
    securityLog.error('admin_courier_retention_list_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to load courier retention data' });
  }
};

export const createCourierRetraining = async (req: Request, res: Response): Promise<void> => {
  const courierProfileId = String(req.params.courierProfileId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  const notes = String(req.body?.notes || '').trim() || null;
  const scheduledAt = req.body?.scheduled_at ? new Date(req.body.scheduled_at) : null;

  if (!courierProfileId || !reason) {
    res.status(400).json({ error: 'courierProfileId and reason are required' });
    return;
  }
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    res.status(400).json({ error: 'scheduled_at must be a valid date' });
    return;
  }

  try {
    const result = await db.query(
      `INSERT INTO courier_retraining_actions
         (courier_profile_id, reason, scheduled_at, notes, created_by, updated_by)
       SELECT id, $2, $3, $4, $5, $5
       FROM courier_profiles
       WHERE id = $1 AND verification_status = 'approved'
       RETURNING *`,
      [courierProfileId, reason, scheduledAt, notes, getActorId(req)]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Approved courier profile not found' });
      return;
    }
    res.status(201).json({ action: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_courier_retraining_create_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to create retraining action' });
  }
};

export const updateCourierRetraining = async (req: Request, res: Response): Promise<void> => {
  const actionId = String(req.params.actionId || '').trim();
  const status = String(req.body?.status || '').trim();
  const notes = req.body?.notes === undefined ? undefined : String(req.body.notes || '').trim() || null;
  if (!RETRAINING_STATUSES.includes(status as (typeof RETRAINING_STATUSES)[number])) {
    res.status(400).json({ error: `status must be one of ${RETRAINING_STATUSES.join(', ')}` });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE courier_retraining_actions
       SET status = $1,
           notes = COALESCE($2, notes),
           completed_at = CASE WHEN $1 = 'completed' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
           updated_by = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, notes ?? null, getActorId(req), actionId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Retraining action not found' });
      return;
    }
    res.json({ action: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_courier_retraining_update_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to update retraining action' });
  }
};
