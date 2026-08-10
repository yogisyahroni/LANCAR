import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';
import { db, readDb } from '../db';

// ─────────────────────────────────────────────
// FOOD-BIKE-054: Visibilitas admin ke hold_balance wallet driver,
// driver_penalty_log, dan status appeal — untuk investigasi manual
// saat driver mengajukan banding.
//
// Skema relasi:
//   courier_wallets.courier_id  → users.id (wallet driver)
//   driver_penalty_log.driver_id → courier_profiles.id (penalty)
//   courier_profiles.user_id     → users.id (penghubung)
// ─────────────────────────────────────────────

export const listDriverWalletHolds = async (req: Request, res: Response) => {
  const search = String(req.query.search ?? '').trim();
  try {
    const where: string[] = [];
    const params: any[] = [];

    // Default: wallet dengan hold aktif atau pernah kena penalty
    params.push('(cw.hold_balance > 0 OR EXISTS (SELECT 1 FROM driver_penalty_log dpl WHERE dpl.driver_id = cp.id))');
    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const whereSql = `WHERE ${params[0]}${where.length ? ' AND ' + where.join(' AND ') : ''}`;

    const result = await readDb.query(
      `SELECT
         cw.id AS wallet_id,
         cw.courier_id,
         cw.balance,
         cw.hold_balance,
         cw.hold_minimum_required,
         cw.status AS wallet_status,
         u.full_name AS driver_name,
         u.phone,
         u.email,
         cp.vehicle_type,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', dpl.id,
             'order_id', dpl.order_id,
             'violation_type', dpl.violation_type,
             'amount_deducted', dpl.amount_deducted,
             'appeal_status', dpl.appeal_status,
             'created_at', dpl.created_at
           ) ORDER BY dpl.created_at DESC)
           FROM driver_penalty_log dpl WHERE dpl.driver_id = cp.id
         ), '[]'::json) AS penalties
       FROM courier_wallets cw
       JOIN users u ON u.id = cw.courier_id
       LEFT JOIN courier_profiles cp ON cp.user_id = u.id
       ${whereSql}
       ORDER BY cw.hold_balance DESC, cw.updated_at DESC
       LIMIT 200`,
      params
    );

    res.json({ drivers: result.rows });
  } catch (error: any) {
    securityLog.error('admin_driver_wallet_holds_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to load driver wallet holds' });
  }
};

// Update appeal_status penalty (approve/reject banding driver)
export const updatePenaltyAppeal = async (req: Request, res: Response) => {
  const { penaltyId } = req.params;
  const { appeal_status, resolution_note } = req.body;

  if (!['approved', 'rejected'].includes(String(appeal_status ?? ''))) {
    res.status(400).json({ error: 'appeal_status must be approved or rejected' });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE driver_penalty_log
       SET appeal_status = $1,
           resolution_note = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [appeal_status, resolution_note || null, penaltyId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Penalty not found' });
      return;
    }

    // Approve = rilis hold (tambahkan kembali ke saldo bebas)
    if (appeal_status === 'approved') {
      const penalty = result.rows[0];
      // driver_id → courier_profiles.id → user_id (courier_wallets.courier_id)
      const profileRes = await db.query(
        `SELECT user_id FROM courier_profiles WHERE id = $1`,
        [penalty.driver_id]
      );
      const userId = profileRes.rows[0]?.user_id;
      if (userId) {
        await db.query(
          `UPDATE courier_wallets
           SET balance = balance + $1,
               hold_balance = GREATEST(hold_balance - $1, 0),
               updated_at = NOW()
           WHERE courier_id = $2`,
          [penalty.amount_deducted, userId]
        );
      }
    }

    securityLog.info('admin_penalty_appeal_updated', {
      penaltyId, appeal_status, actor: getActorId(req)
    });
    res.json({ penalty: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_penalty_appeal_update_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to update penalty appeal' });
  }
};
