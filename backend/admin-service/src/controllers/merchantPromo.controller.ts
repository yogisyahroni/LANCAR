import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';

/**
 * M2: Coupon/promo self-service merchant (FB-098/099/100).
 * Merchant buat promo sendiri (diskon menu, buy-1-get-1) tanpa approval admin.
 * Potongan dibebankan ke merchant_net di settlement (bukan komisi platform).
 *
 * merchant_id di-resolve dari JWT user → merchants.user_id.
 */

const DISCOUNT_TYPES = ['percent', 'fixed', 'buy1get1'] as const;
type DiscountType = (typeof DISCOUNT_TYPES)[number];

async function resolveMerchantId(userId: string): Promise<string | null> {
  const res = await readDb.query(`SELECT id FROM merchants WHERE user_id = $1 LIMIT 1`, [userId]);
  return res.rows[0]?.id || null;
}

export const listMerchantPromos = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
  const pageSize = Math.min(100, parseInt((req.query.page_size as string) || '50', 10) || 50);
  const offset = (page - 1) * pageSize;
  try {
    const merchantId = await resolveMerchantId(userId);
    if (!merchantId) return res.status(403).json({ success: false, message: 'Akun bukan merchant' });

    const countRes = await readDb.query(
      `SELECT COUNT(*)::int AS total FROM merchant_promos WHERE merchant_id = $1`,
      [merchantId]
    );
    const rows = await readDb.query(
      `SELECT id, merchant_id, menu_item_id, discount_type, discount_value,
              max_discount_idr, starts_at, ends_at, is_active, created_at
       FROM merchant_promos
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, pageSize, offset]
    );
    return res.status(200).json({
      success: true,
      data: {
        promos: rows.rows.map(mapRow),
        page,
        pageSize,
        total: Number(countRes.rows[0]?.total || 0)
      }
    });
  } catch (error) {
    securityLog.error('LIST_MERCHANT_PROMOS_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal memuat promo' });
  }
};

export const createMerchantPromo = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const body = req.body || {};
  const discountType = body.discount_type as DiscountType;
  const discountValue = Number(body.discount_value);
  const maxDiscount = body.max_discount_idr != null ? Number(body.max_discount_idr) : null;
  const menuItemId = body.menu_item_id || null;
  const startsAt = body.starts_at ? new Date(body.starts_at) : new Date();
  const endsAt = body.ends_at ? new Date(body.ends_at) : new Date(Date.now() + 30 * 24 * 3600 * 1000);

  if (!DISCOUNT_TYPES.includes(discountType)) {
    return res.status(400).json({ success: false, message: 'discount_type tidak valid' });
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return res.status(400).json({ success: false, message: 'discount_value harus > 0' });
  }
  if (discountType === 'percent' && discountValue > 100) {
    return res.status(400).json({ success: false, message: 'Diskon persen maksimal 100%' });
  }
  if (isNaN(endsAt.getTime()) || isNaN(startsAt.getTime()) || endsAt <= startsAt) {
    return res.status(400).json({ success: false, message: 'Rentang waktu promo tidak valid' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const merchantId = await resolveMerchantId(userId);
    if (!merchantId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Akun bukan merchant' });
    }
    if (menuItemId) {
      const mi = await client.query(`SELECT id FROM merchant_menu_items WHERE id = $1 AND merchant_id = $2`, [menuItemId, merchantId]);
      if (mi.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Menu item tidak milik merchant ini' });
      }
    }
    const insert = await client.query(
      `INSERT INTO merchant_promos (merchant_id, menu_item_id, discount_type, discount_value, max_discount_idr, starts_at, ends_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id, merchant_id, menu_item_id, discount_type, discount_value, max_discount_idr, starts_at, ends_at, is_active, created_at`,
      [merchantId, menuItemId, discountType, discountValue, maxDiscount, startsAt, endsAt]
    );
    await client.query('COMMIT');
    return res.status(201).json({ success: true, data: mapRow(insert.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('CREATE_MERCHANT_PROMO_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal membuat promo' });
  } finally {
    client.release();
  }
};

export const updateMerchantPromo = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const id = req.params.id;
  const body = req.body || {};
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const merchantId = await resolveMerchantId(userId);
    if (!merchantId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Akun bukan merchant' });
    }
    const owned = await client.query(`SELECT id FROM merchant_promos WHERE id = $1 AND merchant_id = $2`, [id, merchantId]);
    if (owned.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Promo tidak ditemukan' });
    }
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (body.discount_type != null) { sets.push(`discount_type = $${i++}`); vals.push(body.discount_type); }
    if (body.discount_value != null) { sets.push(`discount_value = $${i++}`); vals.push(Number(body.discount_value)); }
    if (body.max_discount_idr != null) { sets.push(`max_discount_idr = $${i++}`); vals.push(Number(body.max_discount_idr)); }
    if (body.starts_at != null) { sets.push(`starts_at = $${i++}`); vals.push(new Date(body.starts_at)); }
    if (body.ends_at != null) { sets.push(`ends_at = $${i++}`); vals.push(new Date(body.ends_at)); }
    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Tidak ada field yang diupdate' });
    }
    sets.push(`updated_at = NOW()`);
    vals.push(id, merchantId);
    const upd = await client.query(
      `UPDATE merchant_promos SET ${sets.join(', ')} WHERE id = $${i++} AND merchant_id = $${i}
       RETURNING id, merchant_id, menu_item_id, discount_type, discount_value, max_discount_idr, starts_at, ends_at, is_active, created_at`,
      vals
    );
    await client.query('COMMIT');
    return res.status(200).json({ success: true, data: mapRow(upd.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('UPDATE_MERCHANT_PROMO_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal update promo' });
  } finally {
    client.release();
  }
};

export const deleteMerchantPromo = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const id = req.params.id;
  try {
    const merchantId = await resolveMerchantId(userId);
    if (!merchantId) return res.status(403).json({ success: false, message: 'Akun bukan merchant' });
    const del = await db.query(`DELETE FROM merchant_promos WHERE id = $1 AND merchant_id = $2`, [id, merchantId]);
    if (del.rowCount === 0) return res.status(404).json({ success: false, message: 'Promo tidak ditemukan' });
    return res.status(200).json({ success: true, message: 'Promo dihapus' });
  } catch (error) {
    securityLog.error('DELETE_MERCHANT_PROMO_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal hapus promo' });
  }
};

export const setMerchantPromoActive = async (req: Request, res: Response) => {
  const userId = getActorId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const id = req.params.id;
  const isActive = !!(req.body && req.body.is_active);
  try {
    const merchantId = await resolveMerchantId(userId);
    if (!merchantId) return res.status(403).json({ success: false, message: 'Akun bukan merchant' });
    const upd = await db.query(
      `UPDATE merchant_promos SET is_active = $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3`,
      [isActive, id, merchantId]
    );
    if (upd.rowCount === 0) return res.status(404).json({ success: false, message: 'Promo tidak ditemukan' });
    return res.status(200).json({ success: true, message: isActive ? 'Promo diaktifkan' : 'Promo dinonaktifkan' });
  } catch (error) {
    securityLog.error('SET_MERCHANT_PROMO_ACTIVE_FAILED', { error });
    return res.status(500).json({ success: false, message: 'Gagal ubah status promo' });
  }
};

function mapRow(r: any) {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    menuItemId: r.menu_item_id,
    discountType: r.discount_type,
    discountValue: Number(r.discount_value),
    maxDiscountIdr: r.max_discount_idr != null ? Number(r.max_discount_idr) : null,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    isActive: r.is_active,
    createdAt: r.created_at
  };
}
