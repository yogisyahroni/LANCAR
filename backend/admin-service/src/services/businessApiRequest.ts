import { db } from '../db';
import { z } from 'zod';

export const BusinessApiRequestSchema = z.object({
  company_name: z.string().min(1, 'Company Name is required').max(255),
  company_website: z.string().url().max(255).optional().or(z.literal('')),
  contact_name: z.string().min(1, 'Contact Name is required').max(255),
  contact_email: z.string().email('Invalid email').max(255),
  contact_phone: z.string().max(50).optional().or(z.literal('')),
  monthly_volume: z.string().max(100).optional().or(z.literal('')),
  use_case: z.string().optional(),
});

export type CreateBusinessApiRequestDto = z.infer<typeof BusinessApiRequestSchema>;

export const createBusinessApiRequest = async (dto: CreateBusinessApiRequestDto) => {
  const query = `
    INSERT INTO business_api_requests (
      company_name, company_website, contact_name, contact_email, 
      contact_phone, monthly_volume, use_case, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
    RETURNING *;
  `;
  const values = [
    dto.company_name,
    dto.company_website || null,
    dto.contact_name,
    dto.contact_email,
    dto.contact_phone || null,
    dto.monthly_volume || null,
    dto.use_case || null,
  ];
  const { rows } = await db.query(query, values);
  return rows[0];
};

export const getBusinessApiRequests = async (status?: string, limit = 50, offset = 0) => {
  let query = `
    SELECT b.*, u.full_name as reviewed_by_name 
    FROM business_api_requests b
    LEFT JOIN users u ON b.reviewed_by = u.id
  `;
  const values: any[] = [];
  
  if (status) {
    values.push(status);
    query += ` WHERE b.status = $${values.length}`;
  }
  
  query += ` ORDER BY b.created_at DESC`;
  
  values.push(limit);
  query += ` LIMIT $${values.length}`;
  
  values.push(offset);
  query += ` OFFSET $${values.length}`;

  const { rows } = await db.query(query, values);
  
  // Get total count
  let countQuery = `SELECT COUNT(*) FROM business_api_requests`;
  const countValues: any[] = [];
  if (status) {
    countValues.push(status);
    countQuery += ` WHERE status = $${countValues.length}`;
  }
  const countRes = await db.query(countQuery, countValues);
  const total = parseInt(countRes.rows[0].count, 10);

  return { data: rows, total };
};

export const getBusinessApiRequestById = async (id: string) => {
  const query = `
    SELECT b.*, u.full_name as reviewed_by_name 
    FROM business_api_requests b
    LEFT JOIN users u ON b.reviewed_by = u.id
    WHERE b.id = $1
  `;
  const { rows } = await db.query(query, [id]);
  return rows[0];
};

export const updateBusinessApiRequestStatus = async (
  id: string, 
  status: 'APPROVED' | 'REJECTED', 
  reviewedBy: string, 
  notes?: string
) => {
  const query = `
    UPDATE business_api_requests 
    SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, notes = COALESCE($3, notes), updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *;
  `;
  const { rows } = await db.query(query, [status, reviewedBy, notes || null, id]);
  return rows[0];
};
