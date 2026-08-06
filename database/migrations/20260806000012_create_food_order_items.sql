-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-071: food_order_items
-- Snapshot item_name & item_price saat order (harga tidak berubah
-- walau merchant update menu di tengah proses)
-- ============================================================

CREATE TABLE IF NOT EXISTS food_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id),
  item_name VARCHAR(150) NOT NULL,
  item_price BIGINT NOT NULL CHECK (item_price >= 0),
  quantity INT NOT NULL CHECK (quantity > 0),
  notes TEXT NULL,
  subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_order_items_order
  ON food_order_items(order_id);

-- +goose Down
DROP TABLE IF EXISTS food_order_items;
