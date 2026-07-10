-- +goose Up
-- Phase 3: Pricing & Tariff Engine End-to-End Dynamic & Functional Schema
-- PRC-001 to PRC-004

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS included_distance_km NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_fee_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volumetric_weight_kg NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_fee_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS promo_sponsor VARCHAR(50) NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS weather_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS traffic_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;

-- Ensure dynamic system configs exist for Pricing & Rounding policies
INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES 
  ('pricing_rounding_mode', '"round"', 'Mode pembulatan harga: round, ceil, atau floor', 'pricing', NOW()),
  ('pricing_rounding_precision_idr', '100', 'Kelipatan pembulatan harga (misal kelipatan 100 IDR)', 'pricing', NOW()),
  ('min_platform_fee_idr', '1000', 'Batas minimum biaya platform per transaksi (IDR)', 'pricing', NOW()),
  ('min_courier_payout_idr', '5000', 'Batas minimum penghasilan kurir per pengantaran (IDR)', 'pricing', NOW()),
  ('max_discount_subsidy_idr', '25000', 'Batas maksimum subsidi diskon promo per transaksi (IDR)', 'pricing', NOW()),
  ('payment_mdr_fixed', '2500', 'Estimasi biaya MDR flat per transaksi (IDR)', 'pricing', NOW())
ON CONFLICT (key) DO NOTHING;

-- +goose Down
ALTER TABLE orders 
  DROP COLUMN IF EXISTS included_distance_km,
  DROP COLUMN IF EXISTS distance_fee_idr,
  DROP COLUMN IF EXISTS volumetric_weight_kg,
  DROP COLUMN IF EXISTS surge_fee_idr,
  DROP COLUMN IF EXISTS discount_idr,
  DROP COLUMN IF EXISTS promo_code,
  DROP COLUMN IF EXISTS promo_sponsor,
  DROP COLUMN IF EXISTS surge_multiplier,
  DROP COLUMN IF EXISTS weather_multiplier,
  DROP COLUMN IF EXISTS traffic_multiplier,
  DROP COLUMN IF EXISTS pricing_snapshot;

DELETE FROM system_configs WHERE key IN ('pricing_rounding_mode', 'pricing_rounding_precision_idr', 'min_platform_fee_idr', 'min_courier_payout_idr', 'max_discount_subsidy_idr', 'payment_mdr_fixed');
