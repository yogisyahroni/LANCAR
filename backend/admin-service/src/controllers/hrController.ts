import { Request, Response } from 'express';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// Zod schemas for validation
const jobPostingSchema = z.object({
  title: z.string().min(1),
  department: z.string().min(1),
  location: z.string().min(1),
  employment_type: z.string().min(1),
  description: z.string().min(1),
  requirements: z.string().min(1),
  status: z.enum(['active', 'draft', 'closed']).default('draft'),
});

const jobApplicationSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  phone_number: z.string().min(1),
  portfolio_url: z.string().url().optional().or(z.literal('')),
  cover_letter: z.string().optional().or(z.literal('')),
});

const updateApplicationStatusSchema = z.object({
  status: z.enum(['new', 'reviewed', 'interviewing', 'offered', 'hired', 'rejected']),
});

// === PUBLIC ENDPOINTS ===

// Get active jobs
export const getPublicJobs = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      "SELECT id, title, department, location, employment_type, description, requirements, created_at FROM job_postings WHERE status = 'active' ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching public jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};

// Apply for a job
export const applyForJob = async (req: Request, res: Response) => {
  try {
    const { id: jobId } = req.params;
    const validatedData = jobApplicationSchema.parse(req.body);

    // Verify job exists and is active
    const jobResult = await db.query("SELECT id FROM job_postings WHERE id = $1 AND status = 'active'", [jobId]);
    if (jobResult.rowCount === 0) {
      return res.status(404).json({ error: "Job not found or not active" });
    }

    const appId = uuidv4();
    await db.query(
      `INSERT INTO job_applications (id, job_posting_id, full_name, email, phone_number, portfolio_url, cover_letter, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')`,
      [
        appId,
        jobId,
        validatedData.full_name,
        validatedData.email,
        validatedData.phone_number,
        validatedData.portfolio_url || null,
        validatedData.cover_letter || null,
      ]
    );

    res.status(201).json({ message: "Application submitted successfully", id: appId });
  } catch (error) {
    console.error("Error applying for job:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to submit application" });
  }
};

// === ADMIN ENDPOINTS ===

// Get all jobs
export const getAdminJobs = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      "SELECT id, title, department, location, employment_type, status, created_at, updated_at FROM job_postings ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching admin jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};

// Get single job details
export const getAdminJobById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM job_postings WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching job:", error);
    res.status(500).json({ error: "Failed to fetch job" });
  }
};

// Create a new job posting
export const createAdminJob = async (req: Request, res: Response) => {
  try {
    const validatedData = jobPostingSchema.parse(req.body);
    // Note: Assuming 'req.user' is populated by auth middleware
    const createdBy = (req as any).user?.id || null; 

    const jobId = uuidv4();
    const result = await db.query(
      `INSERT INTO job_postings (id, title, department, location, employment_type, description, requirements, status, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        jobId,
        validatedData.title,
        validatedData.department,
        validatedData.location,
        validatedData.employment_type,
        validatedData.description,
        validatedData.requirements,
        validatedData.status,
        createdBy,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating job:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to create job" });
  }
};

// Update a job posting
export const updateAdminJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = jobPostingSchema.parse(req.body);

    const result = await db.query(
      `UPDATE job_postings 
       SET title = $1, department = $2, location = $3, employment_type = $4, description = $5, requirements = $6, status = $7, updated_at = NOW() 
       WHERE id = $8 RETURNING *`,
      [
        validatedData.title,
        validatedData.department,
        validatedData.location,
        validatedData.employment_type,
        validatedData.description,
        validatedData.requirements,
        validatedData.status,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating job:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to update job" });
  }
};

// Delete a job posting
export const deleteAdminJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query("DELETE FROM job_postings WHERE id = $1 RETURNING id", [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("Error deleting job:", error);
    res.status(500).json({ error: "Failed to delete job" });
  }
};

// Get all applications
export const getAdminApplications = async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT a.*, j.title as job_title 
      FROM job_applications a 
      JOIN job_postings j ON a.job_posting_id = j.id 
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
};

// Update application status
export const updateAdminApplicationStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateApplicationStatusSchema.parse(req.body);
    const reviewedBy = (req as any).user?.id || null;

    const result = await db.query(
      `UPDATE job_applications 
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW() 
       WHERE id = $3 RETURNING *`,
      [validatedData.status, reviewedBy, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating application status:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to update application status" });
  }
};
