import { Request, Response } from 'express';
import crypto from 'crypto';
import { db, readDb } from '../db';
import { saveSecureUploadBuffer } from '../security/uploadSecurity';

// ─────────────────────────────────────────────
// WEB MERCHANT REGISTRATION (merchant.bawain.my.id)
// Endpoint public — pola courier web registration.
// 1) upload dokumen → file_url (dipakai RegisterMerchantRequest)
// 2) cek status pendaftaran (by email + HP, tanpa login)
// ─────────────────────────────────────────────

// doc_type yang diterima — sama dengan doc_type merchant_documents + field
// RegisterMerchantRequest (ktp_pemilik_url, foto_tempat_usaha_url, ...).
const MERCHANT_DOC_TYPES = [
  'ktp_pemilik',
  'foto_tempat_usaha',
  'rekening_bank',
  'nib',
  'sertifikat_halal',
  'spp_irt',
  'izin_edar_bpom',
] as const;

export const uploadMerchantPublicDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const docType = String(req.body?.doc_type || '').trim();
    if (!(MERCHANT_DOC_TYPES as readonly string[]).includes(docType)) {
      res.status(400).json({ error: `Invalid merchant document type. Must be one of: ${MERCHANT_DOC_TYPES.join(', ')}` });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `${docType}-${crypto.randomUUID()}${req.file.safeExtension || '.jpg'}`;
    const savedUpload = saveSecureUploadBuffer(req.file, `merchant-documents/${today}`, filename);

    res.status(201).json({
      success: true,
      data: {
        doc_type: docType,
        file_url: savedUpload.fileUrl,
        original_file_name: req.file.originalname,
        mime_type: req.file.detectedMimeType,
        file_size_bytes: req.file.size,
        checksum_sha256: req.file.checksumSha256,
      },
      message: 'Dokumen berhasil diupload',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Cek status pendaftaran merchant tanpa login — by email ATAU phone_number.
// Dipakai halaman "Cek Status" di merchant.bawain.my.id.
export const getMerchantRegistrationStatus = async (req: Request, res: Response): Promise<void> => {
  const email = String(req.query.email || '').trim().toLowerCase();
  const phone = String(req.query.phone || '').trim();
  if (!email && !phone) {
    res.status(400).json({ error: 'Parameter email atau phone wajib diisi' });
    return;
  }

  try {
    let sql = `
      SELECT u.id AS user_id, u.status AS user_status,
             m.id AS merchant_id, m.nama_toko, m.verification_status,
             m.rejection_reason, m.created_at
      FROM users u
      LEFT JOIN merchants m ON m.user_id = u.id
      WHERE `;
    const params: any[] = [];
    if (email && phone) {
      params.push(email, phone);
      sql += `(LOWER(u.email) = $1 OR u.phone = $2)`;
    } else if (email) {
      params.push(email);
      sql += `LOWER(u.email) = $1`;
    } else {
      params.push(phone);
      sql += `u.phone = $1`;
    }
    sql += ` LIMIT 1`;

    const resData = await readDb.query(sql, params);
    const row = resData.rows[0];
    if (!row) {
      res.status(404).json({ status: 'not_found', message: 'Pendaftaran tidak ditemukan' });
      return;
    }
    if (!row.merchant_id) {
      res.status(200).json({ status: 'no_merchant', message: 'Akun ditemukan, tetapi belum ada data toko.' });
      return;
    }

    res.status(200).json({
      status: row.verification_status,
      nama_toko: row.nama_toko,
      user_status: row.user_status,
      rejection_reason: row.rejection_reason || null,
      created_at: row.created_at,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
