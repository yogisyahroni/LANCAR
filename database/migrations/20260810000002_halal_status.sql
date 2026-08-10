-- +goose Up
-- ============================================================
-- LANCAR — ADR 003 (2026-08-10): Halal soft-gate (model Grab/GoFood)
-- Sertifikat halal TIDAK lagi wajib untuk buka toko. Merchant tanpa
-- sertifikat tetap bisa buka. halal_status dipakai untuk label + filter:
--   halal_certified = punya nomor + expiry valid (badge HALAL)
--   non_halal       = self-declare merchant (badge NON-HALAL)
--   unknown         = default, tanpa badge, muncul di semua filter
-- ============================================================

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS halal_status VARCHAR(16) NOT NULL DEFAULT 'unknown'
  CONSTRAINT merchants_halal_status_check
  CHECK (halal_status IN ('halal_certified', 'non_halal', 'unknown'));

-- Backfill: merchant yang sudah punya sertifikat halal valid → halal_certified
UPDATE merchants SET halal_status = 'halal_certified'
WHERE halal_cert_number IS NOT NULL AND halal_cert_number <> ''
  AND halal_expiry_date IS NOT NULL AND halal_expiry_date >= CURRENT_DATE;

-- +goose Down
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_halal_status_check;
ALTER TABLE merchants DROP COLUMN IF EXISTS halal_status;
