import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        detectedMimeType?: AllowedUploadMime;
        safeExtension?: AllowedUploadExtension;
        safeFileName?: string;
        checksumSha256?: string;
      }
    }
  }
}

export type UploadProfileName = 'courierDocument' | 'evidenceImage' | 'customerAttachment' | 'profileImage' | 'bulkCsv' | 'newsImage';

export type AllowedUploadMime =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'text/csv';

export type AllowedUploadExtension = '.pdf' | '.jpg' | '.png' | '.webp' | '.csv';

type UploadProfile = {
  maxBytes: number;
  allowedMimeTypes: readonly AllowedUploadMime[];
  filenamePrefix: string;
};

const uploadProfiles: Record<UploadProfileName, UploadProfile> = {
  courierDocument: {
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    filenamePrefix: 'courier-document',
  },
  evidenceImage: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    filenamePrefix: 'evidence-image',
  },
  customerAttachment: {
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    filenamePrefix: 'customer-attachment',
  },
  profileImage: {
    maxBytes: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    filenamePrefix: 'profile-image',
  },
  bulkCsv: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['text/csv'],
    filenamePrefix: 'bulk-order',
  },
  newsImage: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    filenamePrefix: 'news',
  },
};

const extensionByMime: Record<AllowedUploadMime, AllowedUploadExtension> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/csv': '.csv',
};

const dangerousTextMarkers = [
  '<!doctype html',
  '<html',
  '<script',
  '<svg',
  '<?php',
  '<%',
];

const isDangerousBinary = (buffer: Buffer) => {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) return true; // Windows PE
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return true; // ELF
  if (buffer.length >= 4 && buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba && buffer[3] === 0xbe) return true; // Java class
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) return true; // shell/script shebang
  return false;
};

const hasPngSignature = (buffer: Buffer) =>
  buffer.length >= 8 &&
  buffer[0] === 0x89 &&
  buffer[1] === 0x50 &&
  buffer[2] === 0x4e &&
  buffer[3] === 0x47 &&
  buffer[4] === 0x0d &&
  buffer[5] === 0x0a &&
  buffer[6] === 0x1a &&
  buffer[7] === 0x0a;

const hasJpegSignature = (buffer: Buffer) =>
  buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

const hasWebpSignature = (buffer: Buffer) =>
  buffer.length >= 12 &&
  buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
  buffer.subarray(8, 12).toString('ascii') === 'WEBP';

const hasPdfSignature = (buffer: Buffer) =>
  buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';

const looksLikeCsv = (buffer: Buffer, originalName: string, declaredMimeType: string) => {
  const ext = path.extname(originalName || '').toLowerCase();
  if (ext !== '.csv') return false;
  if (!['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'].includes(declaredMimeType)) return false;
  if (buffer.includes(0x00)) return false;

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8').trimStart().toLowerCase();
  if (!sample) return false;
  if (dangerousTextMarkers.some((marker) => sample.startsWith(marker) || sample.includes(marker))) return false;

  const controlBytes = buffer.subarray(0, Math.min(buffer.length, 4096)).filter((byte) =>
    byte < 0x09 || (byte > 0x0d && byte < 0x20)
  );
  if (controlBytes.length > 0) return false;

  return sample.includes(',') || sample.includes(';') || sample.includes('\n');
};

export const detectUploadMime = (
  buffer: Buffer,
  originalName = '',
  declaredMimeType = ''
): { mimeType: AllowedUploadMime; extension: AllowedUploadExtension } | null => {
  if (!buffer || buffer.length === 0) return null;
  if (isDangerousBinary(buffer)) return null;

  const sample = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trimStart().toLowerCase();
  if (dangerousTextMarkers.some((marker) => sample.startsWith(marker))) return null;

  if (hasPdfSignature(buffer)) return { mimeType: 'application/pdf', extension: '.pdf' };
  if (hasJpegSignature(buffer)) return { mimeType: 'image/jpeg', extension: '.jpg' };
  if (hasPngSignature(buffer)) return { mimeType: 'image/png', extension: '.png' };
  if (hasWebpSignature(buffer)) return { mimeType: 'image/webp', extension: '.webp' };
  if (looksLikeCsv(buffer, originalName, declaredMimeType)) return { mimeType: 'text/csv', extension: '.csv' };

  return null;
};

export const getUploadProfile = (profileName: UploadProfileName) => uploadProfiles[profileName];

export const secureUploadSingle = (fieldName: string, profileName: UploadProfileName): RequestHandler[] => {
  const profile = getUploadProfile(profileName);
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: profile.maxBytes,
      files: 1,
      fields: 30,
    },
  }).single(fieldName);

  return [
    (req: Request, res: Response, next: NextFunction) => {
      parser(req, res, (error: unknown) => {
        if (!error) {
          next();
          return;
        }

        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            success: false,
            error: `File too large. Maximum size is ${Math.floor(profile.maxBytes / 1024 / 1024)}MB.`,
          });
          return;
        }

        if (error instanceof multer.MulterError) {
          res.status(400).json({ success: false, error: `Invalid upload: ${error.code}` });
          return;
        }

        next(error);
      });
    },
    (req: Request, res: Response, next: NextFunction) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      if (file.size > profile.maxBytes) {
        res.status(413).json({
          success: false,
          error: `File too large. Maximum size is ${Math.floor(profile.maxBytes / 1024 / 1024)}MB.`,
        });
        return;
      }

      const detected = detectUploadMime(file.buffer, file.originalname, file.mimetype);
      if (!detected || !profile.allowedMimeTypes.includes(detected.mimeType)) {
        res.status(415).json({
          success: false,
          error: `Unsupported or unsafe file content for ${profileName} upload.`,
        });
        return;
      }

      file.detectedMimeType = detected.mimeType;
      file.safeExtension = detected.extension;
      file.safeFileName = `${profile.filenamePrefix}-${crypto.randomUUID()}${detected.extension}`;
      file.checksumSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
      next();
    },
  ];
};

export const getPrivateUploadRoot = () =>
  path.resolve(process.env.UPLOAD_PRIVATE_DIR || process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads'));

const normalizeStorageScope = (scope: string) => {
  const normalized = scope.replace(/\\/g, '/').split('/').filter(Boolean);
  if (normalized.length === 0 || normalized.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new Error('Invalid upload storage scope');
  }
  return normalized.join('/');
};

export const saveSecureUploadBuffer = (
  file: Express.Multer.File,
  scope: string,
  preferredFileName?: string
): { storageKey: string; fileUrl: string; absolutePath: string; filename: string } => {
  if (!file.safeExtension || !file.detectedMimeType) {
    throw new Error('Upload file has not passed security validation');
  }

  const root = getPrivateUploadRoot();
  const normalizedScope = normalizeStorageScope(scope);
  const rawFilename = preferredFileName || file.safeFileName || `${crypto.randomUUID()}${file.safeExtension}`;
  const filename = path.basename(rawFilename);
  if (!filename.endsWith(file.safeExtension)) {
    throw new Error('Upload filename extension does not match detected content type');
  }

  const targetDir = path.join(root, normalizedScope);
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
  const absolutePath = path.join(targetDir, filename);
  fs.writeFileSync(absolutePath, file.buffer, { flag: 'wx', mode: 0o640 });

  const storageKey = `${normalizedScope}/${filename}`;
  return {
    storageKey,
    fileUrl: `/uploads/${storageKey}`,
    absolutePath,
    filename,
  };
};

export const resolvePrivateUploadPath = (relativePath: string) => {
  const root = getPrivateUploadRoot();
  const normalized = path.posix.normalize(`/${relativePath.replace(/\\/g, '/')}`).slice(1);
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../') || normalized.split('/').some((segment) => segment.startsWith('.'))) {
    return null;
  }

  const absolutePath = path.resolve(root, normalized);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolutePath !== root && !absolutePath.startsWith(rootWithSeparator)) {
    return null;
  }
  return absolutePath;
};
