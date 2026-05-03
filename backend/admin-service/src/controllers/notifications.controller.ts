import { Request, Response } from 'express';
import { db, readDb } from '../db';

export const getNotificationTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT 
        id, 
        key as "trigger", 
        COALESCE(title, key) as "subject", 
        body as "content", 
        CASE WHEN channel IS NOT NULL THEN ARRAY[channel] ELSE ARRAY['email']::text[] END as "channels", 
        is_active 
      FROM notification_templates 
      ORDER BY key ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching notification templates:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getNotificationTemplateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await readDb.query(`
      SELECT 
        id, 
        key as "trigger", 
        COALESCE(title, key) as "subject", 
        body as "content", 
        CASE WHEN channel IS NOT NULL THEN ARRAY[channel] ELSE ARRAY['email']::text[] END as "channels", 
        is_active 
      FROM notification_templates 
      WHERE id = $1
    `, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching notification template by ID:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createNotificationTemplate = async (req: Request, res: Response): Promise<void> => {
  const { trigger, subject, content, channels, reason } = req.body;

  if (!trigger || !subject || !content) {
    res.status(400).json({ error: 'Trigger, subject, and content are required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO notification_templates (key, title, body, channel)
       VALUES ($1, $2, $3, $4) RETURNING id, key as "trigger", COALESCE(title, key) as "subject", body as "content", CASE WHEN channel IS NOT NULL THEN ARRAY[channel] ELSE ARRAY['email']::text[] END as "channels", is_active`,
      [trigger, subject, content, Array.isArray(channels) ? channels[0] : 'email']
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`notification:${trigger}`, true, changedBy, reason || `Created notification template: ${trigger}`, JSON.stringify(result.rows[0]), 'general']
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating notification template:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const updateNotificationTemplate = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { subject, content, channels, reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query("SELECT key FROM notification_templates WHERE id = $1", [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const template = checkRes.rows[0];

    const result = await client.query(
      `UPDATE notification_templates SET title = COALESCE($1, title), body = COALESCE($2, body), channel = COALESCE($3, channel), updated_at = NOW() WHERE id = $4 RETURNING id, key as "trigger", COALESCE(title, key) as "subject", body as "content", CASE WHEN channel IS NOT NULL THEN ARRAY[channel] ELSE ARRAY['email']::text[] END as "channels", is_active`,
      [subject, content, Array.isArray(channels) ? channels[0] : null, id]
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`notification:${template.key}`, true, changedBy, reason || `Updated notification template: ${template.key}`, JSON.stringify(result.rows[0]), 'general']
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating notification template:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const deleteNotificationTemplate = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query("SELECT key FROM notification_templates WHERE id = $1", [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const template = checkRes.rows[0];

    await client.query("DELETE FROM notification_templates WHERE id = $1", [id]);

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, category) 
       VALUES ($1, $2, $3, $4, $5)`,
      [`notification:${template.key}`, false, changedBy, reason || `Deleted notification template: ${template.key}`, 'general']
    );

    await client.query('COMMIT');
    res.json({ message: 'Template deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error deleting notification template:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};
