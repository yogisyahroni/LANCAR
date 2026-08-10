-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-006: Food Delivery Order Extensions
-- Ikuti pola persis 20260725000003_tambalban_order_extensions.sql
-- ============================================================

-- Extend service_sub_type CHECK dengan 'food_delivery'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_sub_type_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_service_sub_type_check
  CHECK (service_sub_type IN (
    'tambal_ban_motor', 'tambal_ban_mobil',
    'towing_motor', 'towing_mobil',
    'food_delivery', NULL
  ));

-- Kolom khusus food
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS merchant_id UUID NULL REFERENCES merchants(id),
  ADD COLUMN IF NOT EXISTS merchant_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS prep_time_minutes INT NULL,
  ADD COLUMN IF NOT EXISTS food_ready_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_orders_merchant_id ON orders(merchant_id)
  WHERE merchant_id IS NOT NULL;

-- +goose Down
ALTER TABLE orders
  DROP COLUMN IF EXISTS merchant_id,
  DROP COLUMN IF EXISTS merchant_accepted_at,
  DROP COLUMN IF EXISTS prep_time_minutes,
  DROP COLUMN IF EXISTS food_ready_at;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_sub_type_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_service_sub_type_check
  CHECK (service_sub_type IN (
    'tambal_ban_motor', 'tambal_ban_mobil',
    'towing_motor', 'towing_mobil', NULL
  ));

DROP INDEX IF EXISTS idx_orders_merchant_id;
