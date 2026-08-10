-- +goose Up
-- ============================================================
-- FB-121: catatan level order (mis. "pisahin sambal semua").
-- Berbeda dari food_order_items.notes (per item) — ini untuk seluruh order.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_notes TEXT NULL;

COMMENT ON COLUMN orders.order_notes IS 'Catatan keseluruhan order (FB-121) — ditulis customer saat checkout, dilihat merchant';

-- +goose Down
ALTER TABLE orders
  DROP COLUMN IF EXISTS order_notes;
