-- +goose Up
-- ============================================================
-- FB-114: rekening bank merchant terstruktur + bisa di-update dari app.
-- Sebelumnya hanya foto dokumen (merchant_documents.rekening_bank);
-- kini simpan data terstruktur untuk payout settlement (FB-113).
-- ============================================================

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS bank_account_verified BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN merchants.bank_name IS 'Nama bank (BCA, Mandiri, dst) — FB-114';
COMMENT ON COLUMN merchants.bank_account_number IS 'Nomor rekening untuk payout — FB-114';
COMMENT ON COLUMN merchants.bank_account_holder IS 'Nama pemilik rekening (harus cocok KTP) — FB-114';

-- +goose Down
ALTER TABLE merchants
  DROP COLUMN IF EXISTS bank_account_verified,
  DROP COLUMN IF EXISTS bank_account_holder,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_name;
