import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';
import { db, readDb } from '../db';

// ─────────────────────────────────────────────
// FOOD-BIKE-048: Admin management merchant
// List, detail (dengan dokumen), approve, reject.
// ─────────────────────────────────────────────

const VALID_STATUS = ['pending', 'approved', 'rejected', 'all'];

export const listAdminMerchants = async (req: Request, res: Response) => {
  const status = String(req.query.status ?? 'pending');
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
  const search = String(req.query.search ?? '').trim();

  if (!VALID_STATUS.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUS.join(', ')}` });
    return;
  }

  try {
    const where: string[] = [];
    const params: any[] = [];
    if (status !== 'all') {
      params.push(status);
      where.push(`m.verification_status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(m.nama_toko ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const totalRes = await readDb.query(
      `SELECT COUNT(*)::int AS total FROM merchants m LEFT JOIN users u ON u.id = m.user_id ${whereSql}`,
      params
    );
    const total = totalRes.rows[0]?.total ?? 0;

    const resData = await readDb.query(
      `SELECT m.id, m.user_id, m.nama_toko, m.alamat,
              to_char(m.jam_buka, 'HH24:MI') AS jam_buka,
              to_char(m.jam_tutup, 'HH24:MI') AS jam_tutup,
              m.is_open, m.completion_rate_pct, m.verification_status,
              m.halal_cert_number, to_char(m.halal_expiry_date, 'YYYY-MM-DD') AS halal_expiry_date,
              m.spp_irt_number, to_char(m.spp_irt_expiry_date, 'YYYY-MM-DD') AS spp_irt_expiry_date,
              m.bpom_number, to_char(m.bpom_expiry_date, 'YYYY-MM-DD') AS bpom_expiry_date,
              m.created_at, m.updated_at,
              u.phone, u.email, u.full_name
       FROM merchants m
       LEFT JOIN users u ON u.id = m.user_id
       ${whereSql}
       ORDER BY m.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    res.json({ merchants: resData.rows, total, page, page_size: pageSize });
  } catch (error: any) {
    securityLog.error('admin_merchants_list_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to list merchants' });
  }
};

// ─────────────────────────────────────────────
// FOOD-BIKE-051: Dashboard performa merchant
// Completion rate, rata-rata prep time, rating, volume order food.
// ─────────────────────────────────────────────
export const listMerchantPerformance = async (req: Request, res: Response) => {
  const search = String(req.query.search ?? '').trim();
  try {
    const where: string[] = [];
    const params: any[] = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(m.nama_toko ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await readDb.query(
      `SELECT
         m.id AS merchant_id,
         m.nama_toko,
         m.is_open,
         m.verification_status,
         COALESCE(m.completion_rate_pct, 0)::float AS completion_rate_pct,
         COUNT(DISTINCT o.id) AS total_orders,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('completed','delivered')) AS completed_orders,
         ROUND(AVG(o.prep_time_minutes) FILTER (WHERE o.prep_time_minutes IS NOT NULL), 1) AS avg_prep_minutes,
         COALESCE(AVG(r.stars) FILTER (WHERE r.stars IS NOT NULL), 0)::float AS avg_rating,
         COUNT(DISTINCT r.id) AS rating_count
       FROM merchants m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN orders o ON o.merchant_id = m.id AND o.service_sub_type = 'food_delivery'
       LEFT JOIN merchant_ratings r ON r.merchant_id = m.id
       ${whereSql}
       GROUP BY m.id, m.nama_toko, m.is_open, m.verification_status, m.completion_rate_pct
       ORDER BY total_orders DESC, m.nama_toko
       LIMIT 200`,
      params
    );

    res.json({ merchants: result.rows });
  } catch (error: any) {
    securityLog.error('admin_merchants_performance_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to load merchant performance' });
  }
};

export const getAdminMerchantDetail = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const merchantRes = await readDb.query(
      `SELECT m.id, m.user_id, m.nama_toko, m.alamat,
              ST_Y(m.lokasi::geometry) AS lokasi_lat, ST_X(m.lokasi::geometry) AS lokasi_lng,
              to_char(m.jam_buka, 'HH24:MI') AS jam_buka,
              to_char(m.jam_tutup, 'HH24:MI') AS jam_tutup,
              m.is_open, m.completion_rate_pct, m.verification_status,
              m.halal_cert_number, to_char(m.halal_expiry_date, 'YYYY-MM-DD') AS halal_expiry_date,
              m.spp_irt_number, to_char(m.spp_irt_expiry_date, 'YYYY-MM-DD') AS spp_irt_expiry_date,
              m.bpom_number, to_char(m.bpom_expiry_date, 'YYYY-MM-DD') AS bpom_expiry_date,
              m.created_at, m.updated_at,
              u.phone, u.email, u.full_name
       FROM merchants m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = $1`,
      [id]
    );
    if (merchantRes.rows.length === 0) {
      res.status(404).json({ error: 'Merchant not found' });
      return;
    }

    const docsRes = await readDb.query(
      `SELECT id, doc_type, file_url, uploaded_at FROM merchant_documents WHERE merchant_id = $1 ORDER BY uploaded_at DESC`,
      [id]
    );
    const menuRes = await readDb.query(
      `SELECT id, nama, harga, kategori, prep_time_minutes, is_available, created_at
       FROM merchant_menu_items WHERE merchant_id = $1 ORDER BY kategori, nama`,
      [id]
    );

    res.json({ merchant: merchantRes.rows[0], documents: docsRes.rows, menu_items: menuRes.rows });
  } catch (error: any) {
    securityLog.error('admin_merchant_detail_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ error: 'Failed to get merchant detail' });
  }
};

export const approveAdminMerchant = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const actor = getActorId(req) ?? 'unknown';
  try {
    // FB-094: tolak approve kalau lokasi toko belum terisi (lokasi = pin di peta saat daftar).
    // Tanpa lokasi, ongkir food & "resto terdekat" tidak bisa dihitung.
    const locCheck = await readDb.query(
      `SELECT id, nama_toko,
              COALESCE(ST_Y(lokasi::geometry), 0) AS lat,
              COALESCE(ST_X(lokasi::geometry), 0) AS lng
       FROM merchants WHERE id = $1`,
      [id]
    );
    if (locCheck.rows.length === 0) {
      res.status(404).json({ error: 'Merchant not found' });
      return;
    }
    const { lat, lng } = locCheck.rows[0] as { lat: number; lng: number };
    if (!lat || !lng) {
      res.status(409).json({ error: 'Merchant belum mengisi lokasi toko (pin di peta). Minta merchant melengkapi lokasi dulu sebelum di-approve.' });
      return;
    }

    const result = await db.query(
      `UPDATE merchants
       SET verification_status = 'approved', updated_at = NOW()
       WHERE id = $1 AND verification_status = 'pending'
       RETURNING id, nama_toko, verification_status`,
      [id]
    );
    if (result.rows.length === 0) {
      const check = await readDb.query(`SELECT id, verification_status FROM merchants WHERE id = $1`, [id]);
      if (check.rows.length === 0) {
        res.status(404).json({ error: 'Merchant not found' });
      } else {
        res.status(409).json({ error: `Merchant already in status ${check.rows[0].verification_status}` });
      }
      return;
    }
    securityLog.info('admin_merchant_approved', { merchant_id: id, actor });
    res.json({ success: true, merchant: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_merchant_approve_failed', { error: error.message, actor });
    res.status(500).json({ error: 'Failed to approve merchant' });
  }
};

export const rejectAdminMerchant = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const actor = getActorId(req) ?? 'unknown';
  const { reason } = req.body ?? {};
  try {
    const result = await db.query(
      `UPDATE merchants
       SET verification_status = 'rejected', rejection_reason = $2, updated_at = NOW()
       WHERE id = $1 AND verification_status = 'pending'
       RETURNING id, nama_toko, verification_status`,
      [id, String(reason ?? '').trim() || null]
    );
    if (result.rows.length === 0) {
      const check = await readDb.query(`SELECT id, verification_status FROM merchants WHERE id = $1`, [id]);
      if (check.rows.length === 0) {
        res.status(404).json({ error: 'Merchant not found' });
      } else {
        res.status(409).json({ error: `Merchant already in status ${check.rows[0].verification_status}` });
      }
      return;
    }
    securityLog.warn('admin_merchant_rejected', { merchant_id: id, actor, reason: String(reason ?? '') });
    res.json({ success: true, merchant: result.rows[0] });
  } catch (error: any) {
    securityLog.error('admin_merchant_reject_failed', { error: error.message, actor });
    res.status(500).json({ error: 'Failed to reject merchant' });
  }
};
