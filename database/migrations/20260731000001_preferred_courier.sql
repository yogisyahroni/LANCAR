-- +goose Up
-- ============================================================
-- Migration 20260731000001: Preferred Courier (customer-selected)
-- Supports "pilih petugas" flow for tambal ban & towing:
-- customer picks a specific courier from nearby list, order
-- is dispatched directly to that courier instead of the queue.
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS preferred_courier_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_orders_preferred_courier
  ON orders(preferred_courier_id)
  WHERE preferred_courier_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_orders_preferred_courier;
ALTER TABLE orders DROP COLUMN IF EXISTS preferred_courier_id;
