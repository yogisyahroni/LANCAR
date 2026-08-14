import { Request, Response } from 'express';
import { db } from '../db';
import { securityLog } from '../security/logRedaction';

const ADMIN_ROLES = ['super_admin', 'ops_security', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

const ROLE_ALIASES: Record<string, AdminRole> = {
  admin: 'ops_admin',
  manager: 'ops_admin',
  operations_admin: 'ops_admin',
  finance: 'finance_admin',
  cs: 'cs_agent',
};

const isAdminRole = (value: string): value is AdminRole =>
  (ADMIN_ROLES as readonly string[]).includes(value);

const normalizeRole = (value: unknown): AdminRole | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const aliased = ROLE_ALIASES[normalized] || normalized;
  return isAdminRole(aliased) ? aliased : null;
};

const normalizeRequiredString = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeOptionalEmail = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length > 0 ? email : null;
};

const handleAdminControllerError = (res: Response, message: string, error: unknown) => {
  securityLog.error(message, { error });
  res.status(500).json({ error: 'Internal server error' });
};

export const getAllAdmins = async (_req: Request, res: Response) => {
  const client = await db.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, full_name, email, role, status, photo_url, phone_number, created_at, updated_at, last_login_at
       FROM users
       WHERE deleted_at IS NULL
         AND role = ANY($1::text[])
       ORDER BY created_at DESC`,
      [ADMIN_ROLES]
    );
    res.json(rows);
  } catch (error: unknown) {
    handleAdminControllerError(res, 'Failed to fetch admin team members', error);
  } finally {
    client.release();
  }
};

export const deleteAdmin = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE users
       SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
         AND role = ANY($2::text[])
         AND role <> 'super_admin'
       RETURNING id`,
      [id, ADMIN_ROLES]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Admin not found or cannot delete super_admin' });
      return;
    }

    await client.query('COMMIT');
    res.json({ message: 'Admin deleted successfully' });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    handleAdminControllerError(res, 'Failed to delete admin team member', error);
  } finally {
    client.release();
  }
};

export const inviteAdmin = async (req: Request, res: Response) => {
  const fullName = normalizeRequiredString(req.body?.full_name);
  const phoneNumber = normalizeRequiredString(req.body?.phone_number);
  const email = normalizeOptionalEmail(req.body?.email);
  const role = normalizeRole(req.body?.role);

  if (!fullName || !phoneNumber || !role) {
    res.status(400).json({ error: 'Full name, phone number, and role are required' });
    return;
  }

  try {
    const result = await db.query(
      `INSERT INTO users (email, full_name, role, phone_number, status, is_verified)
       VALUES ($1, $2, $3, $4, 'active', true)
       RETURNING id, email, full_name, role, phone_number, status, created_at`,
      [email, fullName, role, phoneNumber]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      res.status(409).json({ error: 'Admin email or phone number already exists' });
      return;
    }

    handleAdminControllerError(res, 'Failed to invite admin team member', error);
  }
};

// A3: Staff oversight super-admin — daftar semua merchant_staff lintas merchant.
// Hanya super_admin yang boleh akses (route sudah requireRole super_admin).
export const listAdminMerchantStaff = async (req: Request, res: Response) => {
  const role = String(req.user?.role || '');
  if (role !== 'super_admin') {
    res.status(403).json({ error: 'Hanya super_admin yang dapat mengakses oversight staff' });
    return;
  }
  const merchantId = String(req.query.merchant_id ?? '').trim();
  const staffRole = String(req.query.role ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
  const offset = (page - 1) * pageSize;

  try {
    const where: string[] = [];
    const params: any[] = [];
    if (merchantId) {
      params.push(merchantId);
      where.push(`s.merchant_id = $${params.length}`);
    }
    if (staffRole) {
      params.push(staffRole);
      where.push(`s.role = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`s.status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const client = await db.connect();
    try {
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM merchant_staff s ${whereSql}`,
        params
      );
      const total = countRes.rows[0]?.total ?? 0;

      const dataRes = await client.query(
        `SELECT s.id, s.merchant_id, s.user_id, s.role, s.status,
                s.permissions, s.invited_by, s.created_at,
                m.nama_toko AS merchant_name,
                u.full_name AS staff_name, u.email AS staff_email, u.phone_number AS staff_phone
         FROM merchant_staff s
         JOIN merchants m ON m.id = s.merchant_id
         LEFT JOIN users u ON u.id = s.user_id
         ${whereSql}
         ORDER BY s.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset]
      );
      res.json({ staff: dataRes.rows, total, page, pageSize });
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    handleAdminControllerError(res, 'Failed to fetch merchant staff oversight', error);
  }
};

// ─────────────────────────────────────────────
// A4: Global banner (pengumuman in-app platform-wide)
// ─────────────────────────────────────────────

const normalizeBannerText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const BANNER_STATUSES = ['active', 'inactive'] as const;

// GET /admin/banners — list semua banner (super_admin).
export const listAdminBanners = async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Hanya super_admin yang dapat mengakses banner' });
    return;
  }
  try {
    const { rows } = await db.query(
      `SELECT id, title, message, image_url, action_url, action_label, priority, status, created_at
       FROM global_banners ORDER BY priority DESC, created_at DESC`
    );
    res.json({ banners: rows });
  } catch (error: unknown) {
    handleAdminControllerError(res, 'Failed to fetch banners', error);
  }
};

// POST /admin/banners — buat banner (super_admin).
export const createAdminBanner = async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Hanya super_admin yang dapat membuat banner' });
    return;
  }
  const title = normalizeBannerText(req.body?.title);
  const message = normalizeBannerText(req.body?.message);
  if (!title || !message) {
    res.status(400).json({ error: 'Title dan message wajib diisi' });
    return;
  }
  const priority = Number(req.body?.priority) || 0;
  const status = BANNER_STATUSES.includes(req.body?.status) ? req.body.status : 'active';
  try {
    const { rows } = await db.query(
      `INSERT INTO global_banners (title, message, image_url, action_url, action_label, priority, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, message, image_url, action_url, action_label, priority, status, created_at`,
      [
        title,
        message,
        normalizeBannerText(req.body?.image_url) || null,
        normalizeBannerText(req.body?.action_url) || null,
        normalizeBannerText(req.body?.action_label) || null,
        priority,
        status,
        req.user?.id,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (error: unknown) {
    handleAdminControllerError(res, 'Failed to create banner', error);
  }
};

// PATCH /admin/banners/:id — update banner (super_admin).
export const updateAdminBanner = async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Hanya super_admin yang dapat mengubah banner' });
    return;
  }
  const { id } = req.params;
  const title = normalizeBannerText(req.body?.title);
  const message = normalizeBannerText(req.body?.message);
  if (!title || !message) {
    res.status(400).json({ error: 'Title dan message wajib diisi' });
    return;
  }
  const priority = Number(req.body?.priority) || 0;
  const status = BANNER_STATUSES.includes(req.body?.status) ? req.body.status : 'active';
  try {
    const { rows } = await db.query(
      `UPDATE global_banners
       SET title=$2, message=$3, image_url=$4, action_url=$5, action_label=$6, priority=$7, status=$8, updated_at=NOW()
       WHERE id=$1
       RETURNING id, title, message, image_url, action_url, action_label, priority, status, created_at`,
      [
        id,
        title,
        message,
        normalizeBannerText(req.body?.image_url) || null,
        normalizeBannerText(req.body?.action_url) || null,
        normalizeBannerText(req.body?.action_label) || null,
        priority,
        status,
      ]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Banner tidak ditemukan' });
      return;
    }
    res.json(rows[0]);
  } catch (error: unknown) {
    handleAdminControllerError(res, 'Failed to update banner', error);
  }
};

// DELETE /admin/banners/:id — hapus banner (super_admin).
export const deleteAdminBanner = async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Hanya super_admin yang dapat menghapus banner' });
    return;
  }
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM global_banners WHERE id=$1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Banner tidak ditemukan' });
      return;
    }
    res.json({ message: 'Banner dihapus' });
  } catch (error: unknown) {
    handleAdminControllerError(res, 'Failed to delete banner', error);
  }
};

// GET /customer/banners — customer ambil banner active (prioritas tertinggi dulu).
export const listCustomerBanners = async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, message, image_url, action_url, action_label, priority
       FROM global_banners WHERE status='active' ORDER BY priority DESC, created_at DESC LIMIT 10`
    );
    res.json({ banners: rows });
  } catch (error: unknown) {
    handleAdminControllerError(res, 'Failed to fetch banners', error);
  }
};


