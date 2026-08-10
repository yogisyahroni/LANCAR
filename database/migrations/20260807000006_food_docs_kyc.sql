-- +goose Up
-- ============================================================
-- LANCAR — FB-092: Dokumen pangan merchant (KYC extend)
-- Regulasi: UU 33/2014 + PP 39/2021 (sertifikat halal BPJPH),
-- PerBPOM 4/2024 (SPP-IRT pangan IRT / izin edar BPOM MD·ML).
-- Nomor + masa berlaku di merchants; bukti file di merchant_documents
-- (doc_type baru: sertifikat_halal, spp_irt, izin_edar_bpom).
-- Wajib sebelum is_open = true; worker cek expiry → auto-suspend toko.
-- ============================================================

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS halal_cert_number VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS halal_expiry_date DATE NULL,
  ADD COLUMN IF NOT EXISTS spp_irt_number VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS spp_irt_expiry_date DATE NULL,
  ADD COLUMN IF NOT EXISTS bpom_number VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS bpom_expiry_date DATE NULL;

-- Perluas CHECK doc_type merchant_documents (Postgres: drop + recreate)
ALTER TABLE merchant_documents DROP CONSTRAINT IF EXISTS merchant_documents_doc_type_check;
ALTER TABLE merchant_documents
  ADD CONSTRAINT merchant_documents_doc_type_check
  CHECK (doc_type IN ('ktp_pemilik', 'foto_tempat_usaha', 'rekening_bank',
                      'nib', 'sertifikat_halal', 'spp_irt', 'izin_edar_bpom'));

-- +goose Down
ALTER TABLE merchants
  DROP COLUMN IF EXISTS halal_cert_number,
  DROP COLUMN IF EXISTS halal_expiry_date,
  DROP COLUMN IF EXISTS spp_irt_number,
  DROP COLUMN IF EXISTS spp_irt_expiry_date,
  DROP COLUMN IF EXISTS bpom_number,
  DROP COLUMN IF EXISTS bpom_expiry_date;

ALTER TABLE merchant_documents DROP CONSTRAINT IF EXISTS merchant_documents_doc_type_check;
ALTER TABLE merchant_documents
  ADD CONSTRAINT merchant_documents_doc_type_check
  CHECK (doc_type IN ('ktp_pemilik', 'foto_tempat_usaha', 'rekening_bank', 'nib'));
