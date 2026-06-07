-- +goose Up
ALTER TABLE promo_budget_ledger
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

ALTER TABLE promo_redemptions
  ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

UPDATE promo_redemptions
   SET redeemed_at = COALESCE(redeemed_at, created_at)
 WHERE status = 'redeemed';

-- +goose Down
ALTER TABLE promo_redemptions
  DROP COLUMN IF EXISTS released_at,
  DROP COLUMN IF EXISTS redeemed_at,
  DROP COLUMN IF EXISTS reserved_until;

ALTER TABLE promo_budget_ledger
  DROP COLUMN IF EXISTS released_at;
