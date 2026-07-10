import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

export const getDisbursementChannels = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT * FROM disbursement_channel_configs
      ORDER BY channel_code ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching disbursement channels:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getDisbursementChannelByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const result = await readDb.query(
      `SELECT * FROM disbursement_channel_configs WHERE channel_code = $1`,
      [code]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Disbursement channel not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('Error fetching disbursement channel by code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createDisbursementChannel = async (req: Request, res: Response): Promise<void> => {
  const {
    channel_code,
    channel_name,
    provider_name,
    is_active,
    daily_limit_idr,
    fee_idr,
    min_amount_idr,
    max_amount_idr,
    config_metadata,
  } = req.body;

  if (!channel_code || !channel_name || !provider_name) {
    res.status(400).json({ success: false, error: 'Missing required fields: channel_code, channel_name, provider_name' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM disbursement_channel_configs WHERE channel_code = $1`,
      [channel_code]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Disbursement channel code already exists' });
      return;
    }

    const result = await client.query(
      `INSERT INTO disbursement_channel_configs (
        channel_code, channel_name, provider_name, is_active,
        daily_limit_idr, fee_idr, min_amount_idr, max_amount_idr, config_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        channel_code,
        channel_name,
        provider_name,
        is_active ?? true,
        daily_limit_idr ?? 250000000,
        fee_idr ?? 2500,
        min_amount_idr ?? 10000,
        max_amount_idr ?? 250000000,
        JSON.stringify(config_metadata || {}),
      ]
    );

    await client.query(
      `INSERT INTO system_audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, 'CREATE', 'disbursement_channel_configs', $2, $3, NOW())`,
      [getActorId(req), result.rows[0].id, JSON.stringify(result.rows[0])]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error creating disbursement channel:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const updateDisbursementChannel = async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  const {
    channel_name,
    provider_name,
    is_active,
    daily_limit_idr,
    fee_idr,
    min_amount_idr,
    max_amount_idr,
    config_metadata,
  } = req.body;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT * FROM disbursement_channel_configs WHERE channel_code = $1`,
      [code]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Disbursement channel not found' });
      return;
    }

    const result = await client.query(
      `UPDATE disbursement_channel_configs SET
        channel_name = COALESCE($1, channel_name),
        provider_name = COALESCE($2, provider_name),
        is_active = COALESCE($3, is_active),
        daily_limit_idr = COALESCE($4, daily_limit_idr),
        fee_idr = COALESCE($5, fee_idr),
        min_amount_idr = COALESCE($6, min_amount_idr),
        max_amount_idr = COALESCE($7, max_amount_idr),
        config_metadata = COALESCE($8::jsonb, config_metadata),
        updated_at = NOW()
       WHERE channel_code = $9
       RETURNING *`,
      [
        channel_name,
        provider_name,
        is_active,
        daily_limit_idr,
        fee_idr,
        min_amount_idr,
        max_amount_idr,
        config_metadata ? JSON.stringify(config_metadata) : null,
        code,
      ]
    );

    await client.query(
      `INSERT INTO system_audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, created_at)
       VALUES ($1, 'UPDATE', 'disbursement_channel_configs', $2, $3, $4, NOW())`,
      [getActorId(req), result.rows[0].id, JSON.stringify(existing.rows[0]), JSON.stringify(result.rows[0])]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Error updating disbursement channel:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};
