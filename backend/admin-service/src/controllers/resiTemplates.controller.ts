import { Request, Response } from 'express';
import { db } from '../db';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const CANONICAL_TEMPLATE_COLUMNS = [
  'id',
  'name',
  'paper_size',
  'layout_config',
  'is_active',
  'provider_code',
  'created_at',
  'updated_at',
].join(', ');

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  paper_size: z.string().trim().min(1).max(50).default('A6'),
  layout_config: z.object({}).passthrough(),
  is_active: z.boolean().default(true),
  provider_code: z.string().trim().max(50).nullable().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  paper_size: z.string().trim().min(1).max(50).optional(),
  layout_config: z.object({}).passthrough().optional(),
  is_active: z.boolean().optional(),
  provider_code: z.string().trim().max(50).nullable().optional(),
});

const normalizeProviderCode = (providerCode: string | null | undefined): string | null => {
  const normalized = providerCode?.trim().toLowerCase();
  return normalized || null;
};

const deactivateOtherActiveTemplates = async (client: any, providerCode: string | null, excludeId?: string) => {
  const exclusion = excludeId ? 'AND id <> $2' : '';
  const params = excludeId ? [providerCode, excludeId] : [providerCode];

  await client.query(
    `UPDATE resi_templates
     SET is_active = false, updated_at = NOW()
     WHERE is_active = true
       AND provider_code IS NOT DISTINCT FROM $1
       ${exclusion}`,
    params,
  );
};

export const createResiTemplate = async (req: Request, res: Response) => {
  try {
    const data = createTemplateSchema.parse(req.body);
    const providerCode = normalizeProviderCode(data.provider_code);
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      if (data.is_active) {
        await deactivateOtherActiveTemplates(client, providerCode);
      }

      const result = await client.query(
        `INSERT INTO resi_templates (id, name, paper_size, layout_config, is_active, provider_code)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${CANONICAL_TEMPLATE_COLUMNS}`,
        [randomUUID(), data.name, data.paper_size, data.layout_config, data.is_active, providerCode],
      );

      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: error.message });
  }
};

export const listResiTemplates = async (req: Request, res: Response) => {
  try {
    const { active_only } = req.query;
    let query = `SELECT ${CANONICAL_TEMPLATE_COLUMNS} FROM resi_templates`;
    const params: any[] = [];

    if (active_only === 'true') {
      query += ' WHERE is_active = $1';
      params.push(true);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getResiTemplate = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const result = await db.query(
      `SELECT ${CANONICAL_TEMPLATE_COLUMNS} FROM resi_templates WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateResiTemplate = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const data = updateTemplateSchema.parse(req.body);
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const checkResult = await client.query(
        `SELECT ${CANONICAL_TEMPLATE_COLUMNS} FROM resi_templates WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Template not found' });
      }

      const current = checkResult.rows[0];
      const nextProviderCode = Object.prototype.hasOwnProperty.call(data, 'provider_code')
        ? normalizeProviderCode(data.provider_code)
        : normalizeProviderCode(current.provider_code);
      const next = {
        name: data.name ?? current.name,
        paperSize: data.paper_size ?? current.paper_size ?? 'A6',
        layoutConfig: data.layout_config ?? current.layout_config,
        isActive: data.is_active ?? current.is_active,
        providerCode: nextProviderCode,
      };

      if (next.isActive) {
        await deactivateOtherActiveTemplates(client, next.providerCode, id);
      }

      const result = await client.query(
        `UPDATE resi_templates
         SET name = $1,
             paper_size = $2,
             layout_config = $3,
             is_active = $4,
             provider_code = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING ${CANONICAL_TEMPLATE_COLUMNS}`,
        [next.name, next.paperSize, next.layoutConfig, next.isActive, next.providerCode, id],
      );

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: error.message });
  }
};

export const deleteResiTemplate = async (req: Request, res: Response) => {
  const client = await db.connect();

  try {
    const id = String(req.params.id);
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT ${CANONICAL_TEMPLATE_COLUMNS} FROM resi_templates WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Template not found' });
    }

    if (existing.rows[0].is_active) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Active template cannot be deleted. Set another template as active first.',
      });
    }

    await client.query('DELETE FROM resi_templates WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Template deleted' });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};
