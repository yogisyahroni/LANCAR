-- +goose Up
-- ============================================================
-- MERCHANT-WEB-001: kolom rejection_reason untuk merchant.
-- Dipakai web merchant.bawain.my.id (cek status pendaftaran):
-- saat admin reject, alasan tampil di web pendaftar.
-- ============================================================

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

-- +goose Down
ALTER TABLE merchants
  DROP COLUMN IF EXISTS rejection_reason;
