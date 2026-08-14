import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';

/**
 * C8: Referral / invite reward.
 *
 * Endpoint:
 *  - GET  /api/v1/customer/referral  → info kode referral customer + statistik
 *  - POST /api/v1/customer/referral/apply → terapkan kode referral saat register/checkout
 */

interface ReferralInfo {
  referralCode: string | null;
  referralLink: string;
  totalReferred: number;
  completedReferred: number;
  pendingRewards: number;
  earnedRewards: number;
  rewards: Array<{
    id: string;
    referredName: string | null;
    status: string;
    rewardType: string | null;
    rewardValue: number | null;
    createdAt: string;
    completedAt: string | null;
  }>;
}

const BASE_APP_URL = process.env.APP_PUBLIC_URL || 'https://tembus.id';

export const getReferralInfo = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const userRes = await readDb.query(
      `SELECT referral_code FROM users WHERE id = $1`,
      [userId]
    );
    const referralCode: string | null = userRes.rows[0]?.referral_code || null;

    const statsRes = await readDb.query(
      `SELECT
         COUNT(*)::int AS total_referred,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_referred,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_rewards,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS earned_rewards
       FROM referral_rewards WHERE referrer_id = $1`,
      [userId]
    );

    const rewardsRes = await readDb.query(
      `SELECT rr.id, u.full_name AS referred_name, rr.status, rr.reward_type,
              rr.reward_value, rr.created_at, rr.completed_at
       FROM referral_rewards rr
       LEFT JOIN users u ON u.id = rr.referred_id
       WHERE rr.referrer_id = $1
       ORDER BY rr.created_at DESC
       LIMIT 50`,
      [userId]
    );

    const stats = statsRes.rows[0] || { total_referred: 0, completed_referred: 0, pending_rewards: 0, earned_rewards: 0 };
    const info: ReferralInfo = {
      referralCode,
      referralLink: referralCode ? `${BASE_APP_URL}/?ref=${referralCode}` : '',
      totalReferred: Number(stats.total_referred),
      completedReferred: Number(stats.completed_referred),
      pendingRewards: Number(stats.pending_rewards),
      earnedRewards: Number(stats.earned_rewards),
      rewards: rewardsRes.rows.map((r: any) => ({
        id: r.id,
        referredName: r.referred_name,
        status: r.status,
        rewardType: r.reward_type,
        rewardValue: r.reward_value ? Number(r.reward_value) : null,
        createdAt: r.created_at,
        completedAt: r.completed_at
      }))
    };

    return res.status(200).json({ success: true, data: info });
  } catch (error) {
    securityLog.error('GET_REFERRAL_INFO_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal memuat info referral' });
  }
};

export const applyReferralCode = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!code) {
    return res.status(400).json({ success: false, message: 'Kode referral wajib diisi' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const referrerRes = await client.query(
      `SELECT id FROM users WHERE referral_code = $1 AND id != $2 AND role = 'customer' LIMIT 1`,
      [code, userId]
    );
    if (referrerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Kode referral tidak valid' });
    }
    const referrerId = referrerRes.rows[0].id;

    const existing = await client.query(
      `SELECT id FROM referral_rewards WHERE referred_id = $1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Kamu sudah menggunakan kode referral' });
    }

    await client.query(
      `INSERT INTO referral_rewards (referrer_id, referred_id, referral_code, status, reward_type, reward_value)
       VALUES ($1, $2, $3, 'pending', 'cashback', 5000)`,
      [referrerId, userId, code]
    );
    await client.query('COMMIT');
    return res.status(201).json({ success: true, message: 'Kode referral berhasil diterapkan' });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('APPLY_REFERRAL_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal menerapkan kode referral' });
  } finally {
    client.release();
  }
};
