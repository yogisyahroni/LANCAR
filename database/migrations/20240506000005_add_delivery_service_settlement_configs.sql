-- +goose Up
ALTER TABLE delivery_service_products
  ADD COLUMN IF NOT EXISTS platform_commission_percent NUMERIC(6,3) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS courier_payout_percent NUMERIC(6,3) NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS courier_min_payout_idr INTEGER NOT NULL DEFAULT 8000,
  ADD COLUMN IF NOT EXISTS mdr_percent NUMERIC(6,3) NOT NULL DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS ppn_percent NUMERIC(6,3) NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS show_customer_price_to_courier BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform_commission_idr INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS courier_payout_estimate_idr INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_snapshot JSONB;

UPDATE delivery_service_products SET
  platform_commission_percent = 20,
  courier_payout_percent = 75,
  courier_min_payout_idr = 9000,
  mdr_percent = 0.7,
  ppn_percent = 11,
  show_customer_price_to_courier = FALSE
WHERE code IN ('tembus_priority', 'tembus_instant');

UPDATE delivery_service_products SET
  platform_commission_percent = 18,
  courier_payout_percent = 78,
  courier_min_payout_idr = 8000,
  mdr_percent = 0.7,
  ppn_percent = 11,
  show_customer_price_to_courier = FALSE
WHERE code IN ('tembus_hemat', 'tembus_same_day');

UPDATE delivery_service_products SET
  platform_commission_percent = 18,
  courier_payout_percent = 76,
  courier_min_payout_idr = 25000,
  mdr_percent = 0.7,
  ppn_percent = 11,
  show_customer_price_to_courier = FALSE
WHERE code = 'tembus_mobil';

-- +goose Down
ALTER TABLE delivery_service_products
  DROP COLUMN IF EXISTS platform_commission_percent,
  DROP COLUMN IF EXISTS courier_payout_percent,
  DROP COLUMN IF EXISTS courier_min_payout_idr,
  DROP COLUMN IF EXISTS mdr_percent,
  DROP COLUMN IF EXISTS ppn_percent,
  DROP COLUMN IF EXISTS show_customer_price_to_courier;

ALTER TABLE orders
  DROP COLUMN IF EXISTS platform_commission_idr,
  DROP COLUMN IF EXISTS courier_payout_estimate_idr,
  DROP COLUMN IF EXISTS settlement_snapshot;

