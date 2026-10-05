-- +goose Up
-- Keep substitution resolution state explicit and make concurrent merchant
-- proposals for the same order item impossible while one is pending.
ALTER TABLE food_substitution_proposals
  ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_food_substitution_pending_item
  ON food_substitution_proposals(order_id, original_menu_item_id)
  WHERE customer_decision = 'pending';

-- +goose Down
DROP INDEX IF EXISTS uq_food_substitution_pending_item;
ALTER TABLE food_substitution_proposals
  DROP COLUMN IF EXISTS resolved;
