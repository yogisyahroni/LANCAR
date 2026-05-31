import { Request, Response } from 'express';
import { db, readDb } from '../db';

export const getZones = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT z.id, z.name, z.code, z.is_active, z.max_couriers, ST_AsText(z.polygon) as polygon,
             (SELECT COUNT(*) FROM meeting_points mp WHERE mp.zone_id = z.id) as meeting_points_count,
             (SELECT COUNT(DISTINCT order_id) FROM order_legs WHERE zone_id = z.id AND status NOT IN ('delivered', 'failed', 'cancelled')) as active_orders_count
      FROM zones z
      ORDER BY z.name ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching zones:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getZoneById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await readDb.query('SELECT id, name, code, is_active, max_couriers, ST_AsText(polygon) as polygon FROM zones WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Zone not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createZone = async (req: Request, res: Response) => {
  const { name, code, polygon, max_couriers, reason } = req.body;
  if (!polygon || typeof polygon !== 'string' || polygon.trim() === '') {
    return res.status(400).json({ error: 'Perimeter boundary (polygon) is required. Please fetch or draw a valid boundary.' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO zones (name, code, polygon, max_couriers)
       VALUES ($1, $2, ST_GeogFromText($3), $4) RETURNING id, name, code, ST_AsText(polygon) as polygon, max_couriers`,
      [name, code, polygon, max_couriers]
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`zone:${code}`, true, changedBy, reason || `Created zone: ${name}`, JSON.stringify(result.rows[0]), 'logistics']
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const updateZone = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, is_active, max_couriers, polygon, reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    let query = 'UPDATE zones SET name = COALESCE($1, name), is_active = COALESCE($2, is_active), max_couriers = COALESCE($3, max_couriers), updated_at = NOW()';
    const values: any[] = [name, is_active, max_couriers];

    if (polygon) {
      query += ', polygon = ST_GeogFromText($4)';
      values.push(polygon);
    }

    query += ' WHERE id = $' + (values.length + 1) + ' RETURNING id, name, code, ST_AsText(polygon) as polygon, is_active, max_couriers';
    values.push(id);

    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Zone not found' });
    }

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`zone:${result.rows[0].code}`, result.rows[0].is_active, changedBy, reason || `Updated zone: ${name}`, JSON.stringify(result.rows[0]), 'logistics']
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const deleteZone = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT code, name FROM zones WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Zone not found' });
    }
    const zone = checkRes.rows[0];

    await client.query('UPDATE order_legs SET zone_id = NULL, pickup_meeting_point_id = NULL, dropoff_meeting_point_id = NULL WHERE zone_id = $1', [id]);
    await client.query('DELETE FROM courier_zones WHERE zone_id = $1', [id]);
    await client.query('DELETE FROM weather_logs WHERE zone_id = $1', [id]);
    await client.query('DELETE FROM dynamic_pricing_logs WHERE zone_id = $1', [id]);
    await client.query('DELETE FROM meeting_points WHERE zone_id = $1', [id]);
    await client.query('DELETE FROM zones WHERE id = $1', [id]);

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, category) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`zone:${zone.code}`, false, changedBy, reason || `Deleted zone: ${zone.name}`, 'logistics']
    );

    await client.query('COMMIT');
    res.json({ message: 'Zone deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getPricingConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT 
        model, 
        base_fee as base_fare, 
        per_km_fee as per_km_rate,
        volumetric_div,
        updated_at
       FROM pricing_configs
       WHERE model = 'p2p'
       ORDER BY model ASC
    `);
    const mapped = result.rows.map(row => {
      const service_type = 'p2p';
      return {
        service_type,
        base_fare: row.base_fare,
        per_km_rate: row.per_km_rate,
        volumetric_div: row.volumetric_div,
        updated_at: row.updated_at
      };
    });
    res.json(mapped);
  } catch (error: any) {
    console.error('Error fetching pricing config:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updatePricingConfig = async (req: Request, res: Response): Promise<void> => {
  const { service_type, base_fare, per_km_rate, volumetric_div } = req.body;
  if (isNaN(base_fare) || isNaN(per_km_rate)) {
    res.status(400).json({ error: 'Invalid pricing values: NaN' });
    return;
  }

  const dbModel = 'p2p';
  if (service_type && !['p2p', 'standard', 'Standard'].includes(String(service_type))) {
    res.status(400).json({ error: 'Only P2P pricing config can be updated' });
    return;
  }

  const volDiv = (volumetric_div !== undefined && volumetric_div !== null && !isNaN(volumetric_div)) ? Number(volumetric_div) : 6000;
  if (volDiv <= 0) {
    res.status(400).json({ error: 'Invalid volumetric divisor' });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE pricing_configs 
       SET base_fee = $1, per_km_fee = $2, volumetric_div = $3, updated_at = NOW() 
       WHERE model = $4 
       RETURNING model, base_fee as base_fare, per_km_fee as per_km_rate, volumetric_div`,
      [base_fare, per_km_rate, volDiv, dbModel]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: `Pricing config model '${dbModel}' not found` });
      return;
    }

    const row = result.rows[0];
    res.json({
      service_type: 'p2p',
      base_fare: row.base_fare,
      per_km_rate: row.per_km_rate,
      volumetric_div: row.volumetric_div
    });
  } catch (error: any) {
    console.error('Error updating pricing config:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getSLAConfigs = async (req: Request, res: Response): Promise<void> => {
  const { model_type } = req.query;
  try {
    const result = await readDb.query(
      `SELECT 
        id, 
        model as model_type, 
        leg_number as stage_order, 
        max_minutes as target_minutes, 
        warning_minutes as critical_minutes,
        CASE 
          WHEN leg_number = 1 THEN 'P2P Delivery'
          WHEN leg_number = 2 THEN 'Direct Delivery Follow-up'
          WHEN leg_number = 3 THEN 'Direct Delivery Review'
          ELSE 'Stage ' || leg_number
        END as stage_name,
        'Auto-generated threshold for ' || model as description
       FROM sla_configs 
       WHERE model = $1 
       ORDER BY leg_number ASC`,
      ['p2p']
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching SLA configs:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateSLAConfig = async (req: Request, res: Response): Promise<void> => {
  const { id, target_minutes, critical_minutes } = req.body;

  if (isNaN(target_minutes) || isNaN(critical_minutes)) {
    res.status(400).json({ error: 'Invalid SLA threshold values: NaN' });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE sla_configs 
       SET max_minutes = $1, warning_minutes = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING id, model as model_type, leg_number as stage_order, max_minutes as target_minutes, warning_minutes as critical_minutes`,
      [target_minutes, critical_minutes, id]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating SLA config:', error);
    res.status(500).json({ error: error.message });
  }
};
