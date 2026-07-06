import { Request, Response } from 'express';
import { db, readDb } from '../db';

export const getLogisticsProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT code, name, is_active, priority, discount_pct, markup_pct, discount_notes,
             created_at, updated_at
      FROM logistics_providers
      ORDER BY priority ASC, name ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching logistics providers:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateLogisticsProvider = async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  const { discount_pct, markup_pct, discount_notes, is_active, priority } = req.body;

  if (isNaN(discount_pct) || isNaN(markup_pct)) {
    res.status(400).json({ error: 'Invalid percentage values: NaN' });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE logistics_providers 
       SET discount_pct = $1, markup_pct = $2, discount_notes = $3, 
           is_active = COALESCE($4, is_active), priority = COALESCE($5, priority), updated_at = NOW() 
       WHERE code = $6 
       RETURNING code, name, is_active, priority, discount_pct, markup_pct, discount_notes`,
      [discount_pct, markup_pct, discount_notes || null, is_active, priority, code]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: `Provider '${code}' not found` });
      return;
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating logistics provider:', error);
    res.status(500).json({ error: error.message });
  }
};
