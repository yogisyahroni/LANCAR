-- +goose Up
-- ============================================================
-- LANCAR — Staffing (X1): kolom business_type di merchants.
-- Fondasi conditional corporate/individual. merchant-web/Register.tsx
-- SUDAH mengirim businessType ('perorangan'|'perusahaan') tapi backend
-- belum menyimpan → ini menutup gap tersebut.
-- ============================================================

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS business_type VARCHAR(20) NOT NULL DEFAULT 'perorangan'
    CHECK (business_type IN ('perorangan', 'perusahaan'));

CREATE INDEX IF NOT EXISTS idx_merchants_business_type ON merchants(business_type);

COMMENT ON COLUMN merchants.business_type IS
  'Jenis usaha: perorangan (owner langsung, TANPA staff) | perusahaan (WAJIB punya staff management)';

-- +goose Down
ALTER TABLE merchants DROP COLUMN IF EXISTS business_type;
