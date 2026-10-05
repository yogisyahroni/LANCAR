import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODERATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
type ModerationStatus = (typeof MODERATION_STATUSES)[number];

const normaliseStatus = (value: unknown): ModerationStatus => {
  const status = String(value || 'pending').trim().toLowerCase() as ModerationStatus;
  if (!MODERATION_STATUSES.includes(status)) throw new Error('status moderasi tidak valid');
  return status;
};

const actorOr401 = (req: Request, res: Response): string | null => {
  const actor = getActorId(req);
  if (!UUID_RE.test(actor)) {
    res.status(401).json({ success: false, error: 'Admin actor tidak valid', code: 'ERR_UNAUTHORIZED' });
    return null;
  }
  return actor;
};

/**
 * Admin-owned moderation queue. The catalog row remains owned by merchant-service,
 * but the review boundary is intentionally exposed here so an admin operator can
 * make a controlled, audited decision before the merchant publication snapshot
 * can include the item.
 */
export const listAdminCatalogModeration = async (req: Request, res: Response): Promise<void> => {
  const rawStatus = String(req.query.status || 'pending').trim().toLowerCase();
  if (!['pending', 'approved', 'rejected', 'all'].includes(rawStatus)) {
    res.status(400).json({ success: false, error: 'status moderasi tidak valid' });
    return;
  }
  const merchantId = String(req.query.merchant_id || '').trim();
  if (merchantId && !UUID_RE.test(merchantId)) {
    res.status(400).json({ success: false, error: 'merchant_id tidak valid' });
    return;
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 25));
  const offset = (page - 1) * pageSize;
  const params: unknown[] = [];
  const predicates: string[] = [];
  if (rawStatus !== 'all') {
    params.push(rawStatus);
    predicates.push(`item.moderation_status = $${params.length}`);
  }
  if (merchantId) {
    params.push(merchantId);
    predicates.push(`item.merchant_id = $${params.length}::uuid`);
  }
  const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : '';

  try {
    const count = await readDb.query(`SELECT COUNT(*)::int AS total FROM merchant_menu_items item ${where}`, params);
    const dataParams = [...params, pageSize, offset];
    const result = await readDb.query(
      `SELECT item.id, item.merchant_id, item.branch_id, item.nama, item.deskripsi,
              item.harga, item.kategori, item.status, item.moderation_status,
              item.moderation_reason, item.moderated_by, item.moderated_at,
              item.version, item.created_at, item.updated_at,
              merchant.nama_toko AS merchant_name,
              branch.name AS branch_name,
              COALESCE(primary_image.url, item.foto) AS image_url
       FROM merchant_menu_items item
       JOIN merchants merchant ON merchant.id = item.merchant_id
       LEFT JOIN merchant_branches branch ON branch.id = item.branch_id
       LEFT JOIN LATERAL (
         SELECT image.url
         FROM merchant_menu_item_images image
         WHERE image.menu_item_id = item.id
         ORDER BY image.is_primary DESC, image.sort_order ASC, image.created_at ASC
         LIMIT 1
       ) primary_image ON TRUE
       ${where}
       ORDER BY item.updated_at ASC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );
    res.json({
      success: true,
      items: result.rows,
      total: Number(count.rows[0]?.total || 0),
      page,
      page_size: pageSize,
      server_authoritative: true,
    });
  } catch (error: any) {
    securityLog.error('admin_catalog_moderation_list_failed', { error: error.message, actor: getActorId(req) });
    res.status(503).json({ success: false, error: 'Queue moderasi katalog belum tersedia', code: 'CATALOG_MODERATION_UNAVAILABLE' });
  }
};

export const reviewAdminCatalogModeration = async (req: Request, res: Response): Promise<void> => {
  const actor = actorOr401(req, res);
  if (!actor) return;
  const itemId = String(req.params.id || '').trim();
  if (!UUID_RE.test(itemId)) {
    res.status(400).json({ success: false, error: 'menu_item_id tidak valid' });
    return;
  }
  let status: ModerationStatus;
  try {
    status = normaliseStatus(req.body?.status);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  if (status === 'pending') {
    res.status(400).json({ success: false, error: 'Keputusan harus approved atau rejected' });
    return;
  }
  const reason = String(req.body?.reason || '').trim();
  if (status === 'rejected' && (reason.length < 10 || reason.length > 500)) {
    res.status(400).json({ success: false, error: 'Alasan penolakan wajib 10-500 karakter' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT item.id, item.merchant_id, item.nama, item.moderation_status,
              item.stock_quantity, item.version
       FROM merchant_menu_items item
       WHERE item.id = $1::uuid
       FOR UPDATE`,
      [itemId],
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Menu item tidak ditemukan' });
      return;
    }
    const item = current.rows[0];
    if (item.moderation_status !== 'pending') {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Menu item sudah memiliki keputusan moderasi', code: 'CATALOG_MODERATION_ALREADY_DECIDED' });
      return;
    }

    const nextItemStatus = status === 'rejected'
      ? 'rejected'
      : Number(item.stock_quantity ?? 0) === 0 ? 'sold_out' : 'active';
    const updated = await client.query(
      `UPDATE merchant_menu_items
       SET moderation_status = $2,
           moderation_reason = NULLIF($3, ''),
           moderated_by = $4::uuid,
           moderated_at = NOW(),
           status = $5,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1::uuid AND moderation_status = 'pending'
       RETURNING id, merchant_id, branch_id, nama, status, moderation_status,
                 moderation_reason, moderated_by, moderated_at, version, updated_at`,
      [itemId, status, reason, actor, nextItemStatus],
    );
    if (updated.rows.length !== 1) {
      throw new Error('Menu item berubah saat diproses; ulangi review dari queue');
    }
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1::uuid, 'admin.catalog.moderation.reviewed', $2::uuid, $3)`,
      [actor, itemId, JSON.stringify({
        merchant_id: item.merchant_id,
        item_name: item.nama,
        decision: status,
        reason: reason || null,
        next_item_status: nextItemStatus,
        previous_version: item.version,
        source: 'admin_catalog_moderation',
      })],
    );
    await client.query('COMMIT');
    res.json({ success: true, item: updated.rows[0], server_authoritative: true });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_catalog_moderation_review_failed', { error: error.message, actor, item_id: itemId });
    res.status(error?.code === '23503' ? 409 : 500).json({ success: false, error: error.message || 'Gagal menyimpan keputusan moderasi' });
  } finally {
    client.release();
  }
};
