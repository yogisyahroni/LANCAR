import { Request, Response } from 'express';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Zod schemas for validation
const newsPostingSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(['published', 'draft']).default('draft'),
});

// === PUBLIC ENDPOINTS ===

// Get active news
export const getPublicNews = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      "SELECT id, title, slug, content, image_url, status, published_at, created_at FROM news_posts WHERE status = 'published' ORDER BY published_at DESC, created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching public news:", error);
    res.status(500).json({ error: "Failed to fetch news" });
  }
};

// Get single news by slug
export const getPublicNewsBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const result = await db.query(
      "SELECT id, title, slug, content, image_url, status, published_at, created_at FROM news_posts WHERE slug = $1 AND status = 'published'",
      [slug]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "News not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching news by slug:", error);
    res.status(500).json({ error: "Failed to fetch news details" });
  }
};

// === ADMIN ENDPOINTS ===

// Get all news
export const getAdminNews = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      "SELECT id, title, slug, image_url, status, published_at, created_at, updated_at FROM news_posts ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching admin news:", error);
    res.status(500).json({ error: "Failed to fetch news" });
  }
};

// Get single news details
export const getAdminNewsById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM news_posts WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "News not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ error: "Failed to fetch news" });
  }
};

// Create a new news posting
export const createAdminNews = async (req: Request, res: Response) => {
  try {
    const validatedData = newsPostingSchema.parse(req.body);
    const authorId = (req as any).user?.id || null;
    
    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const newsId = uuidv4();
    const baseSlug = generateSlug(validatedData.title);
    // Add short uuid to prevent collision
    const slug = `${baseSlug}-${(newsId as string).substring(0, 8)}`;
    
    const publishedAt = validatedData.status === 'published' ? new Date() : null;

    const result = await db.query(
      `INSERT INTO news_posts (id, title, slug, content, image_url, author_id, status, published_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        newsId,
        validatedData.title,
        slug,
        validatedData.content,
        imageUrl,
        authorId,
        validatedData.status,
        publishedAt
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating news:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to create news" });
  }
};

// Update a news posting
export const updateAdminNews = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = newsPostingSchema.parse(req.body);

    // Fetch existing news to check status transition
    const existingResult = await db.query("SELECT status, image_url, published_at FROM news_posts WHERE id = $1", [id]);
    if (existingResult.rowCount === 0) {
      return res.status(404).json({ error: "News not found" });
    }
    const existing = existingResult.rows[0];

    let imageUrl = existing.image_url;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    let publishedAt = existing.published_at;
    if (existing.status !== 'published' && validatedData.status === 'published') {
      publishedAt = new Date(); // Just published
    }

    const baseSlug = generateSlug(validatedData.title);
    const slug = `${baseSlug}-${(id as string).substring(0, 8)}`;

    const result = await db.query(
      `UPDATE news_posts 
       SET title = $1, slug = $2, content = $3, image_url = $4, status = $5, published_at = $6, updated_at = NOW() 
       WHERE id = $7 RETURNING *`,
      [
        validatedData.title,
        slug,
        validatedData.content,
        imageUrl,
        validatedData.status,
        publishedAt,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating news:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors });
    }
    res.status(500).json({ error: "Failed to update news" });
  }
};

// Delete a news posting
export const deleteAdminNews = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query("DELETE FROM news_posts WHERE id = $1 RETURNING id", [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "News not found" });
    }
    
    res.json({ message: "News deleted successfully" });
  } catch (error) {
    console.error("Error deleting news:", error);
    res.status(500).json({ error: "Failed to delete news" });
  }
};
