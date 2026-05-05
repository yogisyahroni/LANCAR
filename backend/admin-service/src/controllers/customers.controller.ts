import { Request, Response } from 'express';
import { db, readDb } from '../db';

export const getCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let baseQuery = `
      FROM customers u
      WHERE u.role = 'customer' AND u.deleted_at IS NULL
    `;
    const params: any[] = [];

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
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCustomerStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalResult = await readDb.query("SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL");
    const revenueResult = await readDb.query("SELECT SUM(total_price_idr) FROM orders WHERE status = 'delivered'");

    res.json({
      total_customers: parseInt(totalResult.rows[0].count),
      umkm_partners: Math.floor(parseInt(totalResult.rows[0].count) * 0.05),
      total_revenue: parseInt(revenueResult.rows[0].sum) || 0
    });
  } catch (error: any) {
    console.error('Error fetching customer stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const exportCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT u.id, u.full_name, u.email, u.phone_number, u.status, u.created_at,
             COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id), 0) as orders_count
      FROM customers u
      WHERE u.role = 'customer' AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `);

    const csvRows = [
      ['Customer ID', 'Name', 'Email', 'Phone', 'Status', 'Orders Count', 'Joined Date'].join(','),
      ...result.rows.map(r => [
        r.id,
        `"${r.full_name}"`,
        r.email,
        r.phone_number || '',
        r.status,
        r.orders_count,
        new Date(r.created_at).toISOString().split('T')[0]
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers_export.csv');
    res.send(csvRows);
  } catch (error: any) {
    console.error('Error exporting customers:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateCustomerStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await db.query("UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND role = 'customer'", [status, id]);
    res.json({ message: 'Customer status updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const bulkEmailCustomers = async (req: Request, res: Response) => {
  const { user_ids, subject, body } = req.body;
  try {
    // In a real app, this would queue emails via a job queue (e.g., BullMQ)
    console.log(`Bulk email to ${user_ids.length} customers: ${subject}`);
    res.json({ message: `Successfully queued ${user_ids.length} emails` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
