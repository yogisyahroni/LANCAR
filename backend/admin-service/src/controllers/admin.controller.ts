import { Request, Response } from 'express';
import { db } from '../db';

export const getAllAdmins = async (req: any, res: any) => {
  const client = await db.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, full_name, email, role, status, photo_url, created_at, last_login_at 
       FROM staff 
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const deleteAdmin = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE staff SET deleted_at = NOW() WHERE id = $1 AND role != \'super_admin\' RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Admin not found or cannot delete super_admin' });
      return;
    }

    await client.query('COMMIT');
    res.json({ message: 'Admin deleted successfully' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const inviteAdmin = async (req: Request, res: Response) => {
  const { email, full_name, role, phone_number } = req.body;
  if (!full_name || !phone_number || !role) {
    res.status(400).json({ error: 'Full name, phone number, and role are required' });
    return;
  }

  try {
    const result = await db.query(
      'INSERT INTO staff (email, full_name, role, phone_number, status) VALUES ($1, $2, $3, $4, \'active\') RETURNING id, email, full_name, role, phone_number',
      [email || null, full_name, role, phone_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
