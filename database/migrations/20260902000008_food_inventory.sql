-- +goose Up
-- FOOD-2026-012: quantity-aware merchant menu inventory.
-- NULL stock/limit preserves existing menu items that have not opted into
-- quantity tracking; configured rows are enforced atomically at order create.
ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS stock_quantity INT NULL,
  ADD COLUMN IF NOT EXISTS daily_sales_limit INT NULL,
  ADD COLUMN IF NOT EXISTS daily_sales_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_limit_reset_at TIMESTAMPTZ NULL;

ALTER TABLE merchant_menu_items
  ADD CONSTRAINT merchant_menu_items_stock_quantity_check
    CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  ADD CONSTRAINT merchant_menu_items_daily_sales_limit_check
    CHECK (daily_sales_limit IS NULL OR daily_sales_limit >= 0),
  ADD CONSTRAINT merchant_menu_items_daily_sales_count_check
    CHECK (daily_sales_count >= 0);

CREATE INDEX IF NOT EXISTS idx_merchant_menu_items_inventory_reset
  ON merchant_menu_items (sales_limit_reset_at)
  WHERE daily_sales_limit IS NOT NULL;

CREATE TABLE IF NOT EXISTS food_inventory_reservations (
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  previous_is_available BOOLEAN NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ NULL,
  PRIMARY KEY (order_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_food_inventory_reservations_active
  ON food_inventory_reservations (menu_item_id, status)
  WHERE status = 'reserved';

-- +goose Down
DROP INDEX IF EXISTS idx_merchant_menu_items_inventory_reset;
DROP INDEX IF EXISTS idx_food_inventory_reservations_active;
DROP TABLE IF EXISTS food_inventory_reservations;
ALTER TABLE merchant_menu_items
  DROP CONSTRAINT IF EXISTS merchant_menu_items_stock_quantity_check,
  DROP CONSTRAINT IF EXISTS merchant_menu_items_daily_sales_limit_check,
  DROP CONSTRAINT IF EXISTS merchant_menu_items_daily_sales_count_check,
  DROP COLUMN IF EXISTS sales_limit_reset_at,
  DROP COLUMN IF EXISTS daily_sales_count,
  DROP COLUMN IF EXISTS daily_sales_limit,
  DROP COLUMN IF EXISTS stock_quantity;
