import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';

const CUSTOMER_ROLE = 'customer';
const MAX_PAGE_LIMIT = 100;
const CUSTOMER_STATUSES = ['active', 'inactive', 'suspended', 'pending_verification'] as const;

type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

const isCustomerStatus = (value: unknown): value is CustomerStatus =>
  typeof value === 'string' && (CUSTOMER_STATUSES as readonly string[]).includes(value);

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parsePositiveInteger = (value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const normalizeSearch = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const handleCustomerControllerError = (res: Response, message: string, error: unknown) => {
  securityLog.error(message, { error });
  res.status(500).json({ error: 'Internal server error' });
};

const csvEscape = (value: unknown) => {
  if (value === null || typeof value === 'undefined') return '';
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

export const getCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20, MAX_PAGE_LIMIT);
    const offset = (page - 1) * limit;
    const search = normalizeSearch(req.query.search);

    let baseQuery = `
      FROM users u
      WHERE u.role = $1 AND u.deleted_at IS NULL
    `;
    const params: unknown[] = [CUSTOMER_ROLE];

    if (search) {
      params.push(`%${search}%`);
      baseQuery += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.id::text ILIKE $${params.length})`;
    }

    const countRes = await readDb.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataQuery = `
      SELECT u.id, u.full_name as name, u.email, u.phone_number as phone, u.status, u.created_at as joined_at,
             COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id), 0) as orders_count
      ${baseQuery}
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await readDb.query(dataQuery, params);
    res.json({ data: result.rows, total, page, limit });
  } catch (error: unknown) {
    handleCustomerControllerError(res, 'Failed to fetch customers', error);
  }
};

export const getCustomerStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const statsResult = await readDb.query(
      `WITH customer_order_counts AS (
         SELECT u.id, u.status, u.created_at, COUNT(o.id)::int as orders_count
         FROM users u
         LEFT JOIN orders o ON o.customer_id = u.id
         WHERE u.role = $1
           AND u.deleted_at IS NULL
         GROUP BY u.id, u.status, u.created_at
       )
       SELECT
         COUNT(*)::int as total_customers,
         COUNT(*) FILTER (WHERE status = 'active')::int as active_customers,
         COUNT(*) FILTER (WHERE status = 'suspended')::int as suspended_customers,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int as new_this_month,
         COUNT(*) FILTER (WHERE orders_count > 100)::int as umkm_partners
       FROM customer_order_counts`,
      [CUSTOMER_ROLE]
    );
    const revenueResult = await readDb.query(
      `SELECT COALESCE(SUM(o.total_price_idr), 0)::bigint as total_revenue
       FROM orders o
       INNER JOIN users u ON u.id = o.customer_id
       WHERE u.role = $1
         AND u.deleted_at IS NULL
         AND o.status = 'delivered'`,
      [CUSTOMER_ROLE]
    );

    const stats = statsResult.rows[0] || {};
    const totalCustomers = Number.parseInt(stats.total_customers || '0', 10);
    const activeCustomers = Number.parseInt(stats.active_customers || '0', 10);
    const suspendedCustomers = Number.parseInt(stats.suspended_customers || '0', 10);
    const newThisMonth = Number.parseInt(stats.new_this_month || '0', 10);
    const umkmPartners = Number.parseInt(stats.umkm_partners || '0', 10);
    const totalRevenue = Number.parseInt(revenueResult.rows[0]?.total_revenue || '0', 10);

    res.json({
      totalCustomers,
      activeCustomers,
      suspendedCustomers,
      newThisMonth,
      umkmPartners,
      totalRevenue,
      total_customers: totalCustomers,
      active_customers: activeCustomers,
      suspended_customers: suspendedCustomers,
      new_this_month: newThisMonth,
      umkm_partners: umkmPartners,
      total_revenue: totalRevenue,
    });
  } catch (error: unknown) {
    handleCustomerControllerError(res, 'Failed to fetch customer stats', error);
  }
};

export const exportCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT u.id, u.full_name, u.email, u.phone_number, u.status, u.created_at,
             COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id), 0) as orders_count
      FROM users u
      WHERE u.role = $1 AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `, [CUSTOMER_ROLE]);

    const csvRows = [
      ['Customer ID', 'Name', 'Email', 'Phone', 'Status', 'Orders Count', 'Joined Date'].join(','),
      ...result.rows.map(r => [
        csvEscape(r.id),
        csvEscape(r.full_name),
        csvEscape(r.email),
        csvEscape(r.phone_number),
        csvEscape(r.status),
        csvEscape(r.orders_count),
        csvEscape(new Date(r.created_at).toISOString().split('T')[0])
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers_export.csv');
    res.send(csvRows);
  } catch (error: unknown) {
    handleCustomerControllerError(res, 'Failed to export customers', error);
  }
};

export const updateCustomerStatus = async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const { status } = req.body;
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Invalid customer id' });
    return;
  }

  if (!isCustomerStatus(status)) {
    res.status(400).json({ error: 'Invalid customer status' });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE users
       SET status = $1, updated_at = NOW()
       WHERE id = $2
         AND role = $3
         AND deleted_at IS NULL
       RETURNING id, full_name as name, email, phone_number as phone, status, updated_at`,
      [status, id, CUSTOMER_ROLE]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    res.json({ message: 'Customer status updated', customer: result.rows[0] });
  } catch (error: unknown) {
    handleCustomerControllerError(res, 'Failed to update customer status', error);
  }
};

export const bulkEmailCustomers = async (req: Request, res: Response): Promise<void> => {
  const { user_ids, subject, body } = req.body;
  try {
    if (!Array.isArray(user_ids) || user_ids.length === 0 || user_ids.some((id) => typeof id !== 'string' || !isUuid(id))) {
      res.status(400).json({ error: 'Valid customer ids are required' });
      return;
    }

    if (typeof subject !== 'string' || subject.trim().length === 0 || typeof body !== 'string' || body.trim().length === 0) {
      res.status(400).json({ error: 'Email subject and body are required' });
      return;
    }

    const result = await readDb.query(
      `SELECT id
       FROM users
       WHERE id = ANY($1::uuid[])
         AND role = $2
         AND deleted_at IS NULL`,
      [user_ids, CUSTOMER_ROLE]
    );

    if (result.rows.length !== user_ids.length) {
      res.status(400).json({ error: 'One or more customer ids are invalid' });
      return;
    }

    securityLog.warn('Customer bulk email requested without configured delivery provider', {
      customer_count: result.rows.length,
      subject_length: subject.trim().length,
      body_length: body.trim().length,
    });
    res.status(501).json({
      error: 'Customer bulk email delivery is not configured',
      message: 'Configure an email delivery provider before enabling bulk customer email.',
    });
  } catch (error: unknown) {
    handleCustomerControllerError(res, 'Failed to prepare customer bulk email', error);
  }
};
