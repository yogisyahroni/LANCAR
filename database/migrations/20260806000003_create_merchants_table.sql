-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-003 + FOOD-BIKE-046: Tabel merchants
-- + merchant_documents (dokumen verifikasi, pola courier_documents
--   doc_type/file_url dari commit eda0a29)
-- verification_status langsung di create table (FOOD-BIKE-046),
-- karena tabel ini baru dibuat — tidak ada data lama.
-- ============================================================

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nama_toko VARCHAR(150) NOT NULL,
  alamat TEXT NOT NULL,
  lokasi GEOGRAPHY(POINT, 4326) NULL,
  jam_buka TIME NULL,
  jam_tutup TIME NULL,
  is_open BOOLEAN NOT NULL DEFAULT FALSE,
  completion_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dokumen verifikasi merchant (KTP pemilik, foto tempat usaha,
-- rekening bank; NIB/izin usaha opsional)
CREATE TABLE IF NOT EXISTS merchant_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  doc_type VARCHAR(30) NOT NULL
    CHECK (doc_type IN ('ktp_pemilik', 'foto_tempat_usaha', 'rekening_bank', 'nib')),
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_user_id ON merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_verification ON merchants(verification_status);
CREATE INDEX IF NOT EXISTS idx_merchant_documents_merchant ON merchant_documents(merchant_id);

-- +goose Down
DROP TABLE IF EXISTS merchant_documents;
DROP TABLE IF EXISTS merchants;
