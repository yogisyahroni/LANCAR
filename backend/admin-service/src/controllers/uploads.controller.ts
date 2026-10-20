import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { resolvePrivateUploadPath } from '../security/uploadSecurity';

const contentTypeByExtension: Record<string, string> = {
  '.csv': 'text/csv; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const getUploadPath = (req: Request): string | null => {
  let rawPath: string;
  try {
    rawPath = decodeURIComponent(req.originalUrl.split('?')[0].replace(/^\/uploads\/?/, ''));
  } catch (_error) {
    return null;
  }
  return rawPath;
};

// Only explicitly public asset namespaces may be served without a session.
// All user, courier, merchant, evidence, and document uploads remain private.
export const isPublicUploadPath = (rawPath: string): boolean => {
  const segments = rawPath.replace(/\\/g, '/').split('/');
  return (segments[0] === 'banners' || segments[0] === 'resi-templates')
    && segments.length > 1
    && segments.every((segment) => Boolean(segment) && segment !== '.' && segment !== '..' && !segment.startsWith('.'));
};

const serveUpload = async (req: Request, res: Response, access: 'public' | 'private'): Promise<void> => {
  const rawPath = getUploadPath(req);
  if (!rawPath) {
    res.status(400).json({ success: false, error: 'Invalid upload path' });
    return;
  }

  if (access === 'public' && !isPublicUploadPath(rawPath)) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const absolutePath = resolvePrivateUploadPath(rawPath);
  if (!absolutePath) {
    res.status(400).json({ success: false, error: 'Invalid upload path' });
    return;
  }

  // Support evidence is never served through the legacy public upload
  // surface. It must pass the case-scoped authenticated download controller.
  if (rawPath === 'support-cases' || rawPath.startsWith('support-cases/')) {
    res.status(403).json({ success: false, error: 'This upload requires authenticated support-case access' });
    return;
  }

  if (!fs.existsSync(absolutePath)) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const ext = path.extname(absolutePath).toLowerCase();
  res.setHeader('Cache-Control', access === 'public' ? 'public, max-age=300' : 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', contentTypeByExtension[ext] || 'application/octet-stream');
  res.sendFile(absolutePath, (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to read upload file' });
    }
  });
};

export const servePublicUpload = async (req: Request, res: Response): Promise<void> =>
  serveUpload(req, res, 'public');

export const servePrivateUpload = async (req: Request, res: Response): Promise<void> =>
  serveUpload(req, res, 'private');
