import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectUploadMime, saveSecureUploadBuffer } from './uploadSecurity';

const pngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]);

describe('uploadSecurity', () => {
  const originalUploadDir = process.env.UPLOAD_PRIVATE_DIR;

  afterEach(() => {
    if (originalUploadDir === undefined) {
      delete process.env.UPLOAD_PRIVATE_DIR;
    } else {
      process.env.UPLOAD_PRIVATE_DIR = originalUploadDir;
    }
  });

  it('detects allowed content by magic bytes instead of trusting the extension', () => {
    expect(detectUploadMime(Buffer.from('MZfake executable'), 'invoice.pdf', 'application/pdf')).toBeNull();
    expect(detectUploadMime(pngBuffer, 'invoice.exe', 'application/octet-stream')).toEqual({
      mimeType: 'image/png',
      extension: '.png',
    });
  });

  it('rejects HTML disguised as CSV', () => {
    const disguisedHtml = Buffer.from('<!doctype html><script>alert(1)</script>');
    expect(detectUploadMime(disguisedHtml, 'orders.csv', 'text/csv')).toBeNull();
  });

  it('writes validated uploads to private storage using server-side filenames', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lancar-upload-'));
    process.env.UPLOAD_PRIVATE_DIR = tempRoot;

    const file = {
      buffer: pngBuffer,
      detectedMimeType: 'image/png',
      safeExtension: '.png',
      safeFileName: 'server-generated.png',
      originalname: 'attacker.php',
      mimetype: 'application/x-php',
      size: pngBuffer.length,
    } as Express.Multer.File;

    const saved = saveSecureUploadBuffer(file, 'orders');

    expect(saved.fileUrl).toBe('/uploads/orders/server-generated.png');
    expect(saved.absolutePath.startsWith(tempRoot)).toBe(true);
    expect(fs.existsSync(saved.absolutePath)).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, 'attacker.php'))).toBe(false);
  });
});
