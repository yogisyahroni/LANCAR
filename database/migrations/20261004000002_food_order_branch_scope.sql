-- +goose Up
-- MWEB-PORTAL-P0-002: food orders must retain the operational outlet that
-- owns the selected menu items. The value is derived server-side; clients do
-- not submit branch_id at checkout.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS branch_id UUID;

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_branch_fk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_branch_fk
      FOREIGN KEY (branch_id) REFERENCES merchant_branches(id) ON DELETE RESTRICT;
  END IF;
END $$;
-- +goose StatementEnd

-- Safe legacy backfill only when every snapshotted menu item belongs to the
-- same branch. Ambiguous historical rows remain NULL and are never presented
-- as branch-scoped by the dashboard.
WITH branch_candidates AS (
  SELECT foi.order_id,
         (ARRAY_AGG(item.branch_id ORDER BY item.branch_id))[1] AS branch_id,
         COUNT(DISTINCT item.branch_id) AS branch_count
  FROM food_order_items foi
  JOIN merchant_menu_items item ON item.id = foi.menu_item_id
  JOIN orders order_row ON order_row.id = foi.order_id
  WHERE order_row.service_sub_type IN ('food_delivery', 'food_pickup')
  GROUP BY foi.order_id
)
UPDATE orders order_row
SET branch_id = candidate.branch_id
FROM branch_candidates candidate
WHERE order_row.id = candidate.order_id
  AND order_row.branch_id IS NULL
  AND candidate.branch_count = 1;

CREATE INDEX IF NOT EXISTS idx_orders_merchant_branch_food_created
  ON orders (merchant_id, branch_id, service_sub_type, created_at DESC);

-- Keep the invariant true for newly inserted snapshot items. The first item
-- derives the order branch; a second item from another outlet is rejected in
-- the same transaction.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_food_order_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  candidate_branch UUID;
  branch_count INTEGER;
BEGIN
  SELECT MIN(item.branch_id), COUNT(DISTINCT item.branch_id)
    INTO candidate_branch, branch_count
  FROM food_order_items foi
  JOIN merchant_menu_items item ON item.id = foi.menu_item_id
  WHERE foi.order_id = NEW.order_id;

  IF branch_count > 1 THEN
    RAISE EXCEPTION 'food order tidak boleh menggabungkan menu dari outlet berbeda';
  END IF;

  UPDATE orders
     SET branch_id = candidate_branch,
         updated_at = NOW()
   WHERE id = NEW.order_id
     AND service_sub_type IN ('food_delivery', 'food_pickup');
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_sync_food_order_branch ON food_order_items;
CREATE CONSTRAINT TRIGGER trg_sync_food_order_branch
AFTER INSERT OR UPDATE OF menu_item_id ON food_order_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sync_food_order_branch();

-- +goose Down
DROP TRIGGER IF EXISTS trg_sync_food_order_branch ON food_order_items;
DROP FUNCTION IF EXISTS sync_food_order_branch();
DROP INDEX IF EXISTS idx_orders_merchant_branch_food_created;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_branch_fk;
ALTER TABLE orders DROP COLUMN IF EXISTS branch_id;
