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
         COUNT(*) FILTER (WHERE status IN ('QUALIFIED','REWARDED'))::int AS completed_referred,
         COUNT(*) FILTER (WHERE status IN ('PENDING','REVIEW'))::int AS pending_rewards,
         COUNT(*) FILTER (WHERE status = 'REWARDED')::int AS earned_rewards
       FROM crm_referral_attributions WHERE referrer_id = $1`,
      [userId]
    );

    const rewardsRes = await readDb.query(
      `SELECT rr.id, u.full_name AS referred_name, rr.status,
              CASE WHEN rr.reward_points > 0 THEN 'points' ELSE 'credit' END AS reward_type,
              CASE WHEN rr.reward_points > 0 THEN rr.reward_points ELSE rr.reward_liability_minor END AS reward_value,
              rr.created_at,
              CASE WHEN rr.status = 'REWARDED' THEN rr.updated_at ELSE NULL END AS completed_at
       FROM crm_referral_attributions rr
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
        status: String(r.status).toLowerCase(),
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
  const marketCode = String(req.body?.market_code || req.header('x-market-code') || '').trim().toLowerCase();
  if (!code) {
    return res.status(400).json({ success: false, message: 'Kode referral wajib diisi' });
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(marketCode)) {
    return res.status(400).json({ success: false, code: 'ERR_REFERRAL_MARKET_REQUIRED', message: 'Market referral wajib diisi' });
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

    const policy = await client.query(
      `SELECT policy_version, reward_type, reward_points, reward_liability_minor, qualifying_rules
         FROM crm_referral_policies
        WHERE market_code = $1 AND active AND effective_from <= NOW()
          AND (effective_to IS NULL OR effective_to > NOW())
        ORDER BY effective_from DESC LIMIT 1`,
      [marketCode],
    );
    if (!policy.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(503).json({ success: false, code: 'ERR_REFERRAL_POLICY_UNAVAILABLE' });
    }

    const existing = await client.query(
      `SELECT id FROM crm_referral_attributions WHERE referred_id = $1
       UNION ALL
       SELECT id FROM referral_rewards WHERE referred_id = $1
       LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Kamu sudah menggunakan kode referral' });
    }

    const selectedPolicy = policy.rows[0];
    await client.query(
      `INSERT INTO crm_referral_attributions
        (referrer_id, referred_id, referral_code, market_code, status,
         reward_points, reward_liability_minor, abuse_signals)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7::jsonb)`,
      [
        referrerId,
        userId,
        code,
        marketCode,
        Number(selectedPolicy.reward_points || 0),
        Number(selectedPolicy.reward_liability_minor || 0),
        JSON.stringify({ policy_version: selectedPolicy.policy_version, signals: [], state: 'PENDING_REVIEW' }),
      ]
    );
    await client.query('COMMIT');
    return res.status(201).json({ success: true, message: 'Kode referral berhasil diterapkan' });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('APPLY_REFERRAL_FAILED', { error });
    if ((error as any)?.code === '23505') {
      return res.status(409).json({ success: false, code: 'ERR_REFERRAL_ALREADY_APPLIED', message: 'Kamu sudah menggunakan kode referral' });
    }
    return res.status(500).json({ success: false, message: 'Gagal menerapkan kode referral' });
  } finally {
    client.release();
  }
};
