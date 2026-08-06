-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-059/060: kolom rating di merchants
-- Dipakai update avg rating merchant saat customer menilai makanan
-- (terpisah dari rating driver di courier_profiles)
-- ============================================================

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NULL,
  ADD COLUMN IF NOT EXISTS rating_count INT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE merchants
  DROP COLUMN IF EXISTS rating_count,
  DROP COLUMN IF EXISTS avg_rating;
