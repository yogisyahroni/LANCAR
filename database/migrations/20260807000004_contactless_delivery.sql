-- +goose Up
-- ============================================================
-- LANCAR — FB-089: Contactless Delivery
-- Flag order antarbarang tanpa kontak fisik: driver foto lokasi
-- dropoff (POD tetap wajib) tanpa interaksi langsung dengan customer.
-- Berlaku default false (semua order lama tetap normal).
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS contactless BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE orders DROP COLUMN IF EXISTS contactless;
