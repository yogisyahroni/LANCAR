import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const approvalProjection = `
  SELECT a.id, a.merchant_id, m.nama_toko AS merchant_name,
         a.requested_by, COALESCE(requester.full_name, requester.email) AS requester_name,
         a.change_type, a.status, a.approval_reference, a.approved_by,
         COALESCE(approver.full_name, approver.email) AS approver_name,
         a.rejected_by, COALESCE(rejecter.full_name, rejecter.email) AS rejecter_name,
         a.rejection_reason, a.expires_at, a.created_at, a.approved_at, a.rejected_at
    FROM merchant_security_approvals a
    JOIN merchants m ON m.id = a.merchant_id
    LEFT JOIN users requester ON requester.id = a.requested_by
    LEFT JOIN users approver ON approver.id = a.approved_by
    LEFT JOIN users rejecter ON rejecter.id = a.rejected_by`;

const statusOf = (value: unknown): string => {
  const status = String(value || '').trim().toLowerCase();
  return ['pending', 'approved', 'rejected', 'expired'].includes(status) ? status : '';
};

const reasonOf = (value: unknown): string => String(value || '').trim().slice(0, 1000);

export const listMerchantSecurityApprovals = async (req: Request, res: Response): Promise<void> => {
  const status = statusOf(req.query.status);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  try {
    const result = await readDb.query(
      `${approvalProjection}
       WHERE ($1 = '' OR a.status = $1)
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [status, limit],
    );
    res.json({ success: true, status: status || null, data: result.rows });
  } catch (error: any) {
    securityLog.error('admin_merchant_security_approval_list_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Persetujuan perubahan merchant belum dapat dimuat' });
  }
};

export const approveMerchantSecurityApproval = async (req: Request, res: Response): Promise<void> => {
  const approvalId = String(req.params.id || '').trim();
  const reference = reasonOf(req.body?.approval_reference);
  if (!UUID_PATTERN.test(approvalId) || !reference) {
    res.status(400).json({ success: false, error: 'ID persetujuan dan referensi keputusan wajib diisi' });
    return;
  }
  const actor = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT id, merchant_id, requested_by, change_type, status, expires_at
         FROM merchant_security_approvals WHERE id = $1 FOR UPDATE`,
      [approvalId],
    );
    const approval = selected.rows[0];
    if (!approval) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'Permintaan persetujuan tidak ditemukan' }); return; }
    if (approval.requested_by === actor) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'MAKER_CHECKER_REQUIRED', error: 'Pembuat permintaan tidak boleh menyetujui permintaan yang sama' });
      return;
    }
    if (approval.status !== 'pending') {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'APPROVAL_NOT_PENDING', error: `Permintaan sudah berstatus ${approval.status}` });
      return;
    }
    if (new Date(approval.expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE merchant_security_approvals SET status = 'expired' WHERE id = $1`, [approvalId]);
      await client.query('COMMIT');
      res.status(409).json({ success: false, code: 'APPROVAL_EXPIRED', error: 'Permintaan persetujuan sudah kedaluwarsa' });
      return;
    }
    const updated = await client.query(
      `UPDATE merchant_security_approvals
          SET status = 'approved', approval_reference = $2, approved_by = $3, approved_at = NOW()
        WHERE id = $1
        RETURNING id, merchant_id, requested_by, change_type, status, approval_reference, approved_by, expires_at, created_at, approved_at`,
      [approvalId, reference, actor],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, merchant_id, payload)
       VALUES ($1, 'merchant.security_approval.approved', $2, $3, $4::jsonb)`,
      [actor, approvalId, approval.merchant_id, JSON.stringify({ change_type: approval.change_type, approval_reference: reference })],
    );
    await client.query('COMMIT');
    res.json({ success: true, data: updated.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_merchant_security_approval_approve_failed', { error: error.message, approval_id: approvalId });
    res.status(500).json({ success: false, error: 'Persetujuan perubahan merchant gagal diproses' });
  } finally {
    client.release();
  }
};

export const rejectMerchantSecurityApproval = async (req: Request, res: Response): Promise<void> => {
  const approvalId = String(req.params.id || '').trim();
  const reason = reasonOf(req.body?.reason);
  if (!UUID_PATTERN.test(approvalId) || !reason) {
    res.status(400).json({ success: false, error: 'ID persetujuan dan alasan penolakan wajib diisi' });
    return;
  }
  const actor = getActorId(req);
  try {
    const result = await db.query(
      `UPDATE merchant_security_approvals
          SET status = 'rejected', rejected_by = $2, rejection_reason = $3, rejected_at = NOW()
        WHERE id = $1 AND status = 'pending' AND requested_by <> $2 AND expires_at > NOW()
        RETURNING id, merchant_id, requested_by, change_type, status, rejected_by, rejection_reason, rejected_at`,
      [approvalId, actor, reason],
    );
    if (!result.rows[0]) {
      res.status(409).json({ success: false, code: 'APPROVAL_NOT_REJECTABLE', error: 'Permintaan tidak lagi menunggu keputusan, sudah kedaluwarsa, atau pembuat tidak boleh menolaknya sendiri' });
      return;
    }
    const row = result.rows[0];
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, merchant_id, payload)
       VALUES ($1, 'merchant.security_approval.rejected', $2, $3, $4::jsonb)`,
      [actor, approvalId, row.merchant_id, JSON.stringify({ change_type: row.change_type, reason })],
    );
    res.json({ success: true, data: row });
  } catch (error: any) {
    securityLog.error('admin_merchant_security_approval_reject_failed', { error: error.message, approval_id: approvalId });
    res.status(500).json({ success: false, error: 'Penolakan perubahan merchant gagal diproses' });
  }
};
