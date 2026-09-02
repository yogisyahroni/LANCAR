import { Request, Response } from 'express';
import axios from 'axios';
import { securityLog } from '../security/logRedaction';
import { db, readDb } from '../db';

const INTEGRATION_GATEWAY_URL = process.env.INTEGRATION_GATEWAY_URL || 'http://integration-gateway:8085';

export const listCustomerLogisticsProviders = async (_req: Request, res: Response): Promise<void> => {
  try {
    const response = await axios.get(`${INTEGRATION_GATEWAY_URL.replace(/\/$/, '')}/api/internal/logistics/providers`, {
      headers: { 'X-Internal-Api-Key': process.env.INTERNAL_API_KEY || '' },
      timeout: 5000,
    });
    res.status(response.status).json(response.data);
  } catch (error: any) {
    securityLog.error('Error fetching registered logistics providers:', error);
    res.status(error.response?.status || 503).json({
      success: false,
      error: 'Daftar provider logistics belum dapat dimuat dari server.',
      code: 'LOGISTICS_PROVIDER_REGISTRY_UNAVAILABLE',
    });
  }
};

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
    securityLog.error('Error fetching logistics providers:', error);
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

  if (discount_pct < 0 || discount_pct > 100 || markup_pct < 0 || markup_pct > 100) {
    res.status(400).json({ error: 'Percentage values must be between 0 and 100' });
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
    securityLog.error('Error updating logistics provider:', error);
    res.status(500).json({ error: error.message });
  }
};
