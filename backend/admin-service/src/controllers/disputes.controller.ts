import { Request, Response } from 'express';
import { db, readDb } from '../db';

export const getDisputes = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let baseQuery = `
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      JOIN users u1 ON d.opened_by = u1.id
      LEFT JOIN users u3 ON d.assigned_to = u3.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'All') {
      params.push(status.toLowerCase());
      baseQuery += ` AND d.status = $${params.length}`;
    }

    const countRes = await readDb.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataQuery = `
      SELECT d.*,
             o.order_number,
             u1.full_name as customer_name,
             u3.full_name as assigned_to_name
      ${baseQuery}
      ORDER BY d.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await readDb.query(dataQuery, params);
    res.json({ data: result.rows, total, page, limit });
  } catch (error: any) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDisputeStats = async (req: Request, res: Response) => {
  try {
    const stats = await readDb.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as pending,
        COUNT(*) FILTER (WHERE status = 'investigating') as investigating,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved
      FROM disputes
    `);
    res.json(stats.rows[0]);
  } catch (error: any) {
    console.error('Error fetching dispute stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateDisputeStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, resolution_note } = req.body;
  try {
    const query = `
      UPDATE disputes 
      SET status = $1, 
          resolution_note = $2, 
          resolved_at = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    const resolvedAt = status === 'resolved' ? new Date() : null;
    const result = await db.query(query, [status, resolution_note, resolvedAt, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating dispute status:', error);
    res.status(500).json({ error: error.message });
  }
};

export const assignDispute = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { admin_id } = req.body;
  try {
    const query = `
      UPDATE disputes 
      SET assigned_to = $1, 
          status = 'investigating',
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [admin_id, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error assigning dispute:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createDispute = async (req: Request, res: Response) => {
  const { order_id, category, description, evidence_urls } = req.body;
  const user_id = (req as any).user?.id;

  if (!order_id || !category || !description) {
    return res.status(400).json({ error: 'Order ID, category, and description are required' });
  }

  try {
    const query = `
      INSERT INTO disputes (order_id, opened_by, category, description, evidence_urls, status)
      VALUES ($1, $2, $3, $4, $5, 'open')
      RETURNING *
    `;
    const result = await db.query(query, [order_id, user_id, category, description, evidence_urls || []]);
    
    // Add an audit log or order event if needed
    await db.query(`
      INSERT INTO order_events (order_id, event_type, description)
      VALUES ($1, 'DISPUTE_OPENED', $2)
    `, [order_id, `Dispute opened for ${category}: ${description.substring(0, 50)}...`]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('Error creating dispute:', error);
    res.status(500).json({ error: error.message });
  }
};

