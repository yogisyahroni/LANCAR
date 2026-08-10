-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-005: radius_max_km per driver (dropdown 1-20 km)
-- ============================================================

ALTER TABLE courier_profiles
  ADD COLUMN IF NOT EXISTS radius_max_km INT DEFAULT 1
    CHECK (radius_max_km IN (1, 2, 4, 6, 10, 12, 14, 16, 18, 20));

-- +goose Down
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS radius_max_km;
