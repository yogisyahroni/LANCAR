import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { db, readDb } from '../db';

export const getPendingFaceVerifications = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    // Allow filtering by status, default to pending_review
    const status = (req.query.status as string) || 'pending_review';

    const countQuery = await readDb.query(
      `SELECT COUNT(*) FROM courier_face_verifications WHERE status = $1`,
      [status]
    );
    const totalCount = parseInt(countQuery.rows[0].count);

    const verificationsQuery = await readDb.query(
      `SELECT 
         cfv.id,
         cfv.courier_id,
         cfv.order_id,
         cfv.verification_type,
         cfv.status,
         cfv.liveness_score,
         cfv.image_url,
         cfv.created_at,
         u.full_name AS full_name,
         cp.nik,
         u.phone_number AS phone
       FROM courier_face_verifications cfv
       JOIN courier_profiles cp ON cp.user_id = cfv.courier_id
       JOIN users u ON u.id = cfv.courier_id
       WHERE cfv.status = $1
       ORDER BY cfv.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    return res.status(200).json({
      success: true,
      data: verificationsQuery.rows,
      meta: {
        total: totalCount,
        page,
        limit,
        total_pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error: any) {
    securityLog.error('[GET FACE VERIFICATIONS ERROR]', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

export const reviewFaceVerification = async (req: Request, res: Response) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject' });
    }

    await client.query('BEGIN');

    const checkQuery = await client.query(
      `SELECT * FROM courier_face_verifications WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (checkQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Verification not found' });
    }

    const verification = checkQuery.rows[0];

    if (verification.status !== 'pending_review') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Cannot review verification in status: ${verification.status}` });
    }

    const newStatus = action === 'approve' ? 'verified' : 'failed';

    await client.query(
      `UPDATE courier_face_verifications 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2`,
      [newStatus, id]
    );

    if (newStatus === 'verified') {
      await client.query(
        `UPDATE courier_profiles
         SET face_enrolled = TRUE,
             face_verified_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1`,
        [verification.courier_id]
      );
    }

    await client.query('COMMIT');
    
    return res.status(200).json({ success: true, message: `Verification successfully ${action}d` });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('[REVIEW FACE VERIFICATION ERROR]', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  } finally {
    client.release();
  }
};
