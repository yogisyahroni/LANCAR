-- Migration: Standardize courier tiers to standart, silver, gold, god_mode and add dynamic search radii
-- Date: 2026-07-01

-- +goose Up
-- 1. Add search_radii_km column to delivery_service_products table
ALTER TABLE delivery_service_products
ADD COLUMN IF NOT EXISTS search_radii_km JSONB NOT NULL DEFAULT '[3, 5, 10]'::jsonb;

-- 2. Standardize courier_tier_configs table
DELETE FROM courier_tier_configs WHERE tier_code IN ('starter', 'reliable', 'elite', 'regular', 'mitra');

INSERT INTO courier_tier_configs (tier_code, tier_name, min_rating, min_completion_rate, min_deliveries_30d, benefit_summary, display_order)
VALUES
  ('standart', 'Standart', 0, 0, 0, 'Akses pekerjaan on-demand reguler dengan radius dasar.', 10),
  ('silver', 'Silver', 4.00, 85, 15, 'Prioritas dispatch menengah dan akses bonus harian.', 20),
  ('gold', 'Gold', 4.50, 90, 30, 'Prioritas dispatch tinggi dan akses campaign promo.', 30),
  ('god_mode', 'God Mode', 4.80, 95, 80, 'Prioritas dispatch tertinggi (prioritas pertama disetujui sistem), campaign premium, dan support prioritas 24/7.', 40)
ON CONFLICT (tier_code) DO UPDATE SET
  tier_name = EXCLUDED.tier_name,
  min_rating = EXCLUDED.min_rating,
  min_completion_rate = EXCLUDED.min_completion_rate,
  min_deliveries_30d = EXCLUDED.min_deliveries_30d,
  benefit_summary = EXCLUDED.benefit_summary,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- 3. Update existing courier profiles to use new standardized tiers
-- IMPORTANT: drop old CHECK constraint FIRST (only allows regular/mitra/elite)
-- otherwise UPDATE to standart/gold/god_mode violates the constraint.
ALTER TABLE courier_profiles DROP CONSTRAINT IF EXISTS courier_profiles_tier_check;
UPDATE courier_profiles
SET tier = CASE
  WHEN tier IN ('starter', 'regular') THEN 'standart'
  WHEN tier IN ('reliable', 'mitra') THEN 'gold'
  WHEN tier = 'elite' THEN 'god_mode'
  ELSE 'standart'
END
WHERE tier IS NOT NULL;

-- Set default value for tier column
ALTER TABLE courier_profiles ALTER COLUMN tier SET DEFAULT 'standart';
-- Re-add CHECK with new standardized tier values
ALTER TABLE courier_profiles
  ADD CONSTRAINT courier_profiles_tier_check
  CHECK (tier IN ('standart','silver','gold','god_mode'));

-- +goose Down
ALTER TABLE courier_profiles ALTER COLUMN tier SET DEFAULT 'regular';

ALTER TABLE delivery_service_products
DROP COLUMN IF EXISTS search_radii_km;
