-- +goose Up
-- ============================================================
-- FOOD-2026-007: Item unavailable + substitution flow
-- Merchant can report an item unavailable mid-preparation,
-- propose a substitution, and customer approve/reject.
-- ============================================================

CREATE TABLE IF NOT EXISTS food_item_unavailable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  reason VARCHAR(200) NOT NULL,
  reported_by_role VARCHAR(20) NOT NULL CHECK (reported_by_role IN ('merchant', 'system')),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_food_item_unavailable_order
  ON food_item_unavailable(order_id);

CREATE TABLE IF NOT EXISTS food_substitution_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id),
  replacement_menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id),
  price_difference_idr BIGINT NOT NULL DEFAULT 0,
  reason TEXT,
  proposed_by_role VARCHAR(20) NOT NULL CHECK (proposed_by_role IN ('merchant', 'system')),
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_decision VARCHAR(10) CHECK (customer_decision IN ('pending', 'approved', 'rejected')),
  customer_decided_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_food_substitution_order
  ON food_substitution_proposals(order_id);

CREATE INDEX IF NOT EXISTS idx_food_substitution_decision
  ON food_substitution_proposals(order_id, customer_decision)
  WHERE customer_decision = 'pending';

-- +goose Down
DROP INDEX IF EXISTS idx_food_substitution_decision;
DROP INDEX IF EXISTS idx_food_substitution_order;
DROP INDEX IF EXISTS idx_food_item_unavailable_order;
DROP TABLE IF EXISTS food_substitution_proposals;
DROP TABLE IF EXISTS food_item_unavailable;
