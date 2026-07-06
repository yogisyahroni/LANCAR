import { Request, Response } from 'express';
import { db } from '../db';
import { z } from 'zod';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  paper_size: z.string().min(1).max(50),
  layout_config: z.object({}).passthrough(),
  is_active: z.boolean().default(true),
  provider_code: z.string().nullable().optional()
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  paper_size: z.string().min(1).max(50).optional(),
  layout_config: z.object({}).passthrough().optional(),
  is_active: z.boolean().optional(),
  provider_code: z.string().nullable().optional()
});

export const createResiTemplate = async (req: Request, res: Response) => {
  try {
    const data = createTemplateSchema.parse(req.body);
    const client = await db.connect();
    
    try {
      const result = await client.query(`
        INSERT INTO resi_templates (name, paper_size, layout_config, is_active, provider_code)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [data.name, data.paper_size, data.layout_config, data.is_active, data.provider_code || null]);
      
      res.status(201).json(result.rows[0]);
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
    let query = 'SELECT * FROM resi_templates';
    let params: any[] = [];
    
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
    const { id } = req.params;
    const result = await db.query('SELECT * FROM resi_templates WHERE id = $1', [id]);
    
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
    const { id } = req.params;
    const data = updateTemplateSchema.parse(req.body);
    
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      const checkResult = await client.query('SELECT * FROM resi_templates WHERE id = $1 FOR UPDATE', [id]);
      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Template not found' });
      }
      
      const current = checkResult.rows[0];
      const updated = { ...current, ...data };
      
      const result = await client.query(`
        UPDATE resi_templates 
        SET name = $1, paper_size = $2, layout_config = $3, is_active = $4, provider_code = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `, [updated.name, updated.paper_size, updated.layout_config, updated.is_active, updated.provider_code || null, id]);
      
      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM resi_templates WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ success: true, message: 'Template deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
