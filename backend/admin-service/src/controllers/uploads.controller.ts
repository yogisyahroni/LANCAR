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

export const servePrivateUpload = async (req: Request, res: Response): Promise<void> => {
  let rawPath: string;
  try {
    rawPath = decodeURIComponent(req.originalUrl.split('?')[0].replace(/^\/uploads\/?/, ''));
  } catch (_error) {
    res.status(400).json({ success: false, error: 'Invalid upload path' });
    return;
  }

  const absolutePath = resolvePrivateUploadPath(rawPath);
  if (!absolutePath) {
    res.status(400).json({ success: false, error: 'Invalid upload path' });
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
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', contentTypeByExtension[ext] || 'application/octet-stream');
  res.sendFile(absolutePath, (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to read upload file' });
    }
  });
};
