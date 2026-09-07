import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';

export const getZones = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT z.id, z.name, z.code, z.market_code, z.geometry_version, z.is_active, z.max_couriers, ST_AsText(z.polygon) as polygon,
             (SELECT COUNT(*) FROM meeting_points mp WHERE mp.zone_id = z.id) as meeting_points_count,
             (SELECT COUNT(DISTINCT order_id) FROM order_legs WHERE zone_id = z.id AND status NOT IN ('delivered', 'failed', 'cancelled')) as active_orders_count
      FROM zones z
      ORDER BY z.name ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    securityLog.error('Error fetching zones:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getZoneById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await readDb.query('SELECT id, name, code, market_code, geometry_version, is_active, max_couriers, ST_AsText(polygon) as polygon FROM zones WHERE id = $1', [id]);
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
  const { name, code, polygon, max_couriers, market_code = 'ID-JK', reason } = req.body;
  if (!polygon || typeof polygon !== 'string' || polygon.trim() === '') {
    return res.status(400).json({ error: 'Perimeter boundary (polygon) is required. Please fetch or draw a valid boundary.' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO zones (name, code, market_code, polygon, max_couriers)
       VALUES ($1, $2, $3, ST_GeogFromText($4), $5)
       RETURNING id, name, code, market_code, geometry_version, ST_AsText(polygon) as polygon, max_couriers, is_active`,
      [name, code, market_code, polygon, max_couriers]
    );

    await client.query(
      `INSERT INTO zone_revisions
         (zone_id, revision_number, market_code, name, code, polygon, is_active, max_couriers, status, change_reason, created_by, approved_by, approved_at, published_at)
       SELECT id, geometry_version, market_code, name, code, polygon, is_active, max_couriers, 'published', $1, $2, $2, NOW(), NOW()
       FROM zones WHERE id = $3`,
      [reason || `Created zone: ${name}`, getActorId(req), result.rows[0].id]
    );

    const changedBy = getActorId(req);
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
  const { name, is_active, max_couriers, polygon, market_code, reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT id, name, code, market_code, geometry_version, polygon, is_active, max_couriers
         FROM zones WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Zone not found' });
    }

    const current = currentResult.rows[0];
    const versionResult = await client.query(
      'SELECT COALESCE(MAX(revision_number), $2)::int + 1 AS next_revision FROM zone_revisions WHERE zone_id = $1',
      [id, current.geometry_version]
    );
    const revisionResult = await client.query(
      `INSERT INTO zone_revisions
         (zone_id, revision_number, market_code, name, code, polygon, is_active, max_couriers, status, change_reason, created_by)
       VALUES ($1, $2, $3, COALESCE($4, $5), $6, COALESCE(ST_GeogFromText($7), $8), COALESCE($9, $10), COALESCE($11, $12), 'draft', $13, $14)
       RETURNING id, zone_id, revision_number, market_code, name, code, ST_AsText(polygon) AS polygon, is_active, max_couriers, status, created_at`,
      [
        id,
        versionResult.rows[0].next_revision,
        market_code || current.market_code,
        name,
        current.name,
        current.code,
        polygon || null,
        current.polygon,
        is_active,
        current.is_active,
        max_couriers,
        current.max_couriers,
        reason || `Draft update for zone: ${current.name}`,
        getActorId(req),
      ]
    );

    const changedBy = getActorId(req);
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`zone:${current.code}`, current.is_active, changedBy, reason || `Draft update for zone: ${current.name}`, JSON.stringify(revisionResult.rows[0]), 'logistics']
    );

    await client.query('COMMIT');
    res.status(202).json({ status: 'draft', revision: revisionResult.rows[0], requires_approval: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getZoneRevisions = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(
      `SELECT id, zone_id, revision_number, market_code, name, code, is_active, max_couriers, status,
              change_reason, created_by, approved_by, approved_at, published_at, rollback_of, created_at,
              ST_AsText(polygon) AS polygon
         FROM zone_revisions WHERE zone_id = $1 ORDER BY revision_number DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error: any) {
    securityLog.error('Error fetching zone revisions:', error);
    res.status(500).json({ error: error.message });
  }
};

export const previewZoneRevision = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const [currentResult, draftResult, activeOrdersResult] = await Promise.all([
      readDb.query(
        `SELECT id, name, code, market_code, geometry_version, is_active, max_couriers, ST_AsText(polygon) AS polygon
           FROM zones WHERE id = $1`,
        [id]
      ),
      readDb.query(
        `SELECT id, zone_id, revision_number, market_code, name, code, is_active, max_couriers, status,
                ST_AsText(polygon) AS polygon, change_reason, created_by, created_at
           FROM zone_revisions
          WHERE zone_id = $1 AND status IN ('draft', 'approved')
          ORDER BY revision_number DESC LIMIT 1`,
        [id]
      ),
      readDb.query(
        `SELECT COUNT(*)::int AS active_orders_count
           FROM order_legs
          WHERE zone_id = $1 AND status NOT IN ('delivered', 'failed', 'cancelled')`,
        [id]
      ),
    ]);
    if (currentResult.rows.length === 0) {
      res.status(404).json({ error: 'Zone not found' });
      return;
    }
    const draft = draftResult.rows[0];
    if (!draft) {
      res.status(404).json({ error: 'No draft revision found' });
      return;
    }
    const current = currentResult.rows[0];
    const changedFields = ['name', 'code', 'market_code', 'is_active', 'max_couriers', 'polygon']
      .filter((field) => String(current[field] ?? '') !== String(draft[field] ?? ''));
    res.json({
      zone_id: id,
      current,
      draft,
      diff: { changed_fields: changedFields, active_orders_count: activeOrdersResult.rows[0]?.active_orders_count || 0 },
      approval: { required: true, status: draft.status, maker_id: draft.created_by },
    });
  } catch (error: any) {
    securityLog.error('Error previewing zone revision:', error);
    res.status(500).json({ error: error.message });
  }
};

export const approveZoneRevision = async (req: Request, res: Response): Promise<void> => {
  const { id, revisionId } = req.params;
  const actorId = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const draftResult = await client.query(
      `SELECT id, zone_id, code, is_active, created_by
         FROM zone_revisions WHERE id = $1 AND zone_id = $2 AND status = 'draft' FOR UPDATE`,
      [revisionId, id]
    );
    if (draftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Draft revision not found' });
      return;
    }
    if (draftResult.rows[0].created_by && String(draftResult.rows[0].created_by) === actorId) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Maker and approver must be different actors' });
      return;
    }
    const result = await client.query(
      `UPDATE zone_revisions
          SET status = 'approved', approved_by = $1, approved_at = NOW()
        WHERE id = $2 AND status = 'draft'
      RETURNING id, zone_id, revision_number, status, approved_by, approved_at`,
      [actorId, revisionId]
    );
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`zone:${draftResult.rows[0].code}`, draftResult.rows[0].is_active, actorId, 'Zone revision approved', JSON.stringify(result.rows[0]), 'logistics']
    );
    await client.query('COMMIT');
    res.json({ status: 'approved', revision: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error approving zone revision:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const publishZoneRevision = async (req: Request, res: Response): Promise<void> => {
  const { id, revisionId } = req.params;
  const actorId = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const revisionResult = await client.query(
      `SELECT id, zone_id, revision_number, market_code, name, code, polygon, is_active, max_couriers, status
         FROM zone_revisions WHERE id = $1 AND zone_id = $2 AND status = 'approved' FOR UPDATE`,
      [revisionId, id]
    );
    if (revisionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Approved revision not found' });
      return;
    }
    const revision = revisionResult.rows[0];
    const result = await client.query(
      `UPDATE zones
          SET name = $1, code = $2, market_code = $3, polygon = $4, is_active = $5,
              max_couriers = $6, geometry_version = $7, updated_at = NOW()
        WHERE id = $8
      RETURNING id, name, code, market_code, geometry_version, is_active, max_couriers, ST_AsText(polygon) AS polygon`,
      [revision.name, revision.code, revision.market_code, revision.polygon, revision.is_active, revision.max_couriers, revision.revision_number, id]
    );
    await client.query(
      `UPDATE zone_revisions SET status = 'published', published_at = NOW(), approved_by = COALESCE(approved_by, $1) WHERE id = $2`,
      [actorId, revisionId]
    );
    await client.query('COMMIT');
    res.json({ status: 'published', zone: result.rows[0], revision: revisionId, active_orders_preserved: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error publishing zone revision:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const rollbackZoneRevision = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const targetRevisionId = String(req.body?.revision_id || '');
  if (!targetRevisionId) {
    res.status(400).json({ error: 'revision_id is required' });
    return;
  }
  const actorId = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const targetResult = await client.query(
      `SELECT id, zone_id, market_code, name, code, polygon, is_active, max_couriers
         FROM zone_revisions WHERE id = $1 AND zone_id = $2 AND status = 'published'`,
      [targetRevisionId, id]
    );
    if (targetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Published target revision not found' });
      return;
    }
    const target = targetResult.rows[0];
    const versionResult = await client.query('SELECT COALESCE(MAX(revision_number), 0)::int + 1 AS next_revision FROM zone_revisions WHERE zone_id = $1', [id]);
    const nextRevision = versionResult.rows[0].next_revision;
    const revisionResult = await client.query(
      `INSERT INTO zone_revisions
         (zone_id, revision_number, market_code, name, code, polygon, is_active, max_couriers, status, change_reason, created_by, approved_by, approved_at, published_at, rollback_of)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'published', $9, $10, $10, NOW(), NOW(), $11)
       RETURNING id, revision_number, status, rollback_of`,
      [id, nextRevision, target.market_code, target.name, target.code, target.polygon, target.is_active, target.max_couriers, `Rollback to revision ${targetRevisionId}`, actorId, targetRevisionId]
    );
    const zoneResult = await client.query(
      `UPDATE zones SET market_code = $1, name = $2, code = $3, polygon = $4, is_active = $5, max_couriers = $6, geometry_version = $7, updated_at = NOW()
        WHERE id = $8 RETURNING id, name, code, market_code, geometry_version, is_active, max_couriers, ST_AsText(polygon) AS polygon`,
      [target.market_code, target.name, target.code, target.polygon, target.is_active, target.max_couriers, nextRevision, id]
    );
    await client.query('COMMIT');
    res.json({ status: 'rolled_back', zone: zoneResult.rows[0], revision: revisionResult.rows[0], active_orders_preserved: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error rolling back zone revision:', error);
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

    const deactivateResult = await client.query(
      `UPDATE zones SET is_active = FALSE, geometry_version = geometry_version + 1, updated_at = NOW()
        WHERE id = $1
      RETURNING id, name, code, market_code, geometry_version, is_active, max_couriers, polygon`,
      [id]
    );
    await client.query(
      `INSERT INTO zone_revisions
         (zone_id, revision_number, market_code, name, code, polygon, is_active, max_couriers, status, change_reason, created_by, approved_by, approved_at, published_at)
       SELECT id, geometry_version, market_code, name, code, polygon, is_active, max_couriers, 'published', $1, $2, $2, NOW(), NOW()
       FROM zones WHERE id = $3`,
      [reason || `Deactivated zone: ${zone.name}`, getActorId(req), id]
    );

    const changedBy = getActorId(req);
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, category) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`zone:${zone.code}`, false, changedBy, reason || `Deactivated zone: ${zone.name}`, 'logistics']
    );

    await client.query('COMMIT');
    res.json({ message: 'Zone deactivated successfully', zone: deactivateResult.rows[0], active_orders_preserved: true });
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
    securityLog.error('Error fetching pricing config:', error);
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

  // SECURITY 2026: Wajib aktor teridentifikasi untuk audit log konfigurasi finansial.
  const actorId = req.user?.id;
  if (!actorId) {
    res.status(401).json({ error: 'Unauthorized: Actor identity required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE pricing_configs 
       SET base_fee = $1, per_km_fee = $2, volumetric_div = $3, updated_at = NOW() 
       WHERE model = $4 
       RETURNING model, base_fee as base_fare, per_km_fee as per_km_rate, volumetric_div`,
      [base_fare, per_km_rate, volDiv, dbModel]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: `Pricing config model '${dbModel}' not found` });
      return;
    }

    // SECURITY 2026: Audit log wajib untuk setiap perubahan konfigurasi harga.
    // Tanpa ini, penyerang yang ubah base_fare ke 0 tidak bisa dideteksi.
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `pricing:p2p:updated`,
        true,
        actorId,
        `Pricing config updated: base_fare=${base_fare}, per_km_rate=${per_km_rate}, volumetric_div=${volDiv}`,
        JSON.stringify({ base_fare, per_km_rate, volumetric_div: volDiv }),
        'pricing'
      ]
    );

    await client.query('COMMIT');

    const row = result.rows[0];
    res.json({
      service_type: 'p2p',
      base_fare: row.base_fare,
      per_km_rate: row.per_km_rate,
      volumetric_div: row.volumetric_div
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    // SECURITY: Jangan expose error.message ke client
    securityLog.error('updatePricingConfig failed', { error: error?.message, actorId });
    res.status(500).json({ error: 'Internal server error updating pricing config' });
  } finally {
    client.release();
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
    securityLog.error('Error fetching SLA configs:', error);
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
    securityLog.error('Error updating SLA config:', error);
    res.status(500).json({ error: error.message });
  }
};
