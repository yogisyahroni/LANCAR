import { Request, Response } from 'express';
import { readDb, db } from '../db';
import { securityLog } from '../security/logRedaction';
import { v4 as uuidv4 } from 'uuid';

export const getChartOfAccounts = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = `
      SELECT 
        id,
        account_code,
        account_name,
        account_type,
        description,
        is_active,
        created_at,
        updated_at
      FROM chart_of_accounts
      ORDER BY account_code ASC
    `;

    const result = await readDb.query(query);
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    securityLog.error('Error fetching chart of accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { account_code, account_name, account_type, description, is_active } = req.body;

    if (!account_code || !account_name || !account_type) {
      res.status(400).json({ success: false, error: 'account_code, account_name, and account_type are required' });
      return;
    }

    const query = `
      INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, description, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const params = [
      uuidv4(),
      account_code,
      account_name,
      account_type,
      description || null,
      is_active !== undefined ? is_active : true
    ];

    const result = await db.query(query, params);

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    securityLog.error('Error creating account:', error);
    if (error.code === '23505') { // Unique violation
       res.status(409).json({ success: false, error: 'Account code already exists' });
       return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { account_name, account_type, description, is_active } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (account_name !== undefined) {
      updates.push(`account_name = $${paramIndex++}`);
      params.push(account_name);
    }
    if (account_type !== undefined) {
      updates.push(`account_type = $${paramIndex++}`);
      params.push(account_type);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const query = `
      UPDATE chart_of_accounts
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, params);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    securityLog.error('Error updating account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
