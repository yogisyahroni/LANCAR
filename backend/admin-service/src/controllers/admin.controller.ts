import { Request, Response } from 'express';
import { db } from '../db';
import { securityLog } from '../security/logRedaction';

const ADMIN_ROLES = ['super_admin', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager'] as const;
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
