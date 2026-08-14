import { Request, Response } from 'express';
import { readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';

/**
 * C9: Loyalty / membership tier view.
 *
 * Tier berdasarkan jumlah order selesai per bulan (rolling 30 hari):
 *  - Bronze : default (< 10 order)
 *  - Silver : > 10 order → -5% discount
 *  - Gold   : > 30 order → -10% discount + priority CS
 *
 * Tidak perlu tabel baru — dihitung langsung dari `orders`.
 */

interface TierDef {
  tier: 'Bronze' | 'Silver' | 'Gold';
  minOrders: number;
  discountPct: number;
  benefits: string[];
}

const TIERS: TierDef[] = [
  { tier: 'Bronze', minOrders: 0, discountPct: 0, benefits: ['Akses semua layanan dasar'] },
  { tier: 'Silver', minOrders: 11, discountPct: 5, benefits: ['Diskon 5% untuk semua layanan', 'Bonus poin referral lebih besar'] },
  { tier: 'Gold', minOrders: 31, discountPct: 10, benefits: ['Diskon 10% untuk semua layanan', 'Prioritas Customer Service', 'Akses promo eksklusif'] }
];

function classifyTier(monthlyOrders: number): { current: TierDef; next: TierDef | null } {
  let current = TIERS[0];
  for (const t of TIERS) {
    if (monthlyOrders >= t.minOrders) current = t;
  }
  const idx = TIERS.indexOf(current);
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  return { current, next };
}

export const getLoyaltyInfo = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const result = await readDb.query(
      `SELECT
         COUNT(*) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed'))::int AS monthly_orders
       FROM orders
       WHERE customer_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );
    const monthlyOrders = Number(result.rows[0]?.monthly_orders || 0);
    const { current, next } = classifyTier(monthlyOrders);

    const progressPct = next
      ? Math.min(100, Math.round(((monthlyOrders - current.minOrders) / (next.minOrders - current.minOrders)) * 100))
      : 100;

    const ordersToNext = next ? Math.max(0, next.minOrders - monthlyOrders) : 0;

    return res.status(200).json({
      success: true,
      data: {
        tier: current.tier,
        monthlyOrders,
        discountPct: current.discountPct,
        benefits: current.benefits,
        nextTier: next ? next.tier : null,
        nextTierDiscountPct: next ? next.discountPct : null,
        ordersToNextTier: ordersToNext,
        progressPct
      }
    });
  } catch (error) {
    securityLog.error('GET_LOYALTY_INFO_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal memuat info loyalty' });
  }
};
