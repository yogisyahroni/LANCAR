import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

const adminActorId = (req: Request) => getActorId(req);

export const getTariffCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT * FROM provider_tariff_cards
      ORDER BY provider_name ASC, service_code ASC, effective_from DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching tariff cards:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createTariffCard = async (req: Request, res: Response): Promise<void> => {
  const { provider_name, service_code, effective_from, effective_to, volumetric_divisor, min_weight_kg, fuel_surcharge_pct, remote_area_surcharge_idr, insurance_fee_pct, insurance_min_fee_idr, return_fee_pct } = req.body;
  
  if (!provider_name || !service_code || !effective_from) {
    res.status(400).json({ success: false, error: 'Missing required fields' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO provider_tariff_cards (
        provider_name, service_code, effective_from, effective_to, volumetric_divisor, min_weight_kg, fuel_surcharge_pct, remote_area_surcharge_idr, insurance_fee_pct, insurance_min_fee_idr, return_fee_pct
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [provider_name, service_code, effective_from, effective_to || null, volumetric_divisor || 6000, min_weight_kg || 1.0, fuel_surcharge_pct || 0, remote_area_surcharge_idr || 0, insurance_fee_pct || 0, insurance_min_fee_idr || 0, return_fee_pct || 0]
    );

    await client.query(
      `INSERT INTO system_audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, 'CREATE', 'provider_tariff_cards', $2, $3, NOW())`,
      [adminActorId(req), result.rows[0].id, JSON.stringify(result.rows[0])]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error creating tariff card:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const getTariffLanes = async (req: Request, res: Response): Promise<void> => {
  const cardId = req.query.cardId;
  if (!cardId) {
    res.status(400).json({ success: false, error: 'cardId is required' });
    return;
  }

  try {
    const result = await readDb.query(`
      SELECT * FROM provider_tariff_lanes
      WHERE card_id = $1::uuid
      ORDER BY origin_zone, destination_zone
    `, [cardId]);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching tariff lanes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listOrderTariffAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 100, provider, orderId } = req.query;
    const params: any[] = [];
    let whereClause = "WHERE 1=1";

    if (provider) {
      params.push(provider);
      whereClause += ` AND courier_provider = $${params.length}`;
    }
    if (orderId) {
      params.push(orderId);
      whereClause += ` AND (id::text = $${params.length} OR awb_number = $${params.length})`;
    }

    params.push(Number(limit) || 100);
    const result = await readDb.query(`
      SELECT 
        id as order_id,
        awb_number as tracking_number,
        courier_provider,
        service_type,
        origin_city,
        destination_city,
        weight_kg,
        total_amount as customer_price_idr,
        COALESCE(provider_cost_idr, ROUND(total_amount * 0.85)) as provider_quote_idr,
        COALESCE(platform_margin_idr, total_amount - COALESCE(provider_cost_idr, ROUND(total_amount * 0.85))) as platform_margin_idr,
        COALESCE(promo_subsidy_idr, 0) as promo_subsidy_idr,
        dpp_idr,
        ppn_idr,
        ppn_rate_effective_pct,
        tax_rule_code,
        created_at
      FROM orders
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `, params);

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error listing order tariff audit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getOrderTariffAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const result = await readDb.query(`
      SELECT 
        o.id as order_id,
        o.awb_number as tracking_number,
        o.courier_provider,
        o.service_type,
        o.origin_city,
        o.destination_city,
        o.weight_kg,
        o.total_amount as customer_price_idr,
        COALESCE(o.provider_cost_idr, ROUND(o.total_amount * 0.85)) as provider_quote_idr,
        COALESCE(o.platform_margin_idr, o.total_amount - COALESCE(o.provider_cost_idr, ROUND(o.total_amount * 0.85))) as platform_margin_idr,
        COALESCE(o.promo_subsidy_idr, 0) as promo_subsidy_idr,
        o.dpp_idr,
        o.ppn_idr,
        o.ppn_rate_effective_pct,
        o.tax_rule_code,
        o.tax_invoice_status,
        o.created_at
      FROM orders o
      WHERE o.id = $1 OR o.awb_number = $1
    `, [orderId]);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('Error fetching order tariff audit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
