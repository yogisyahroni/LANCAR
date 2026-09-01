-- +goose Up
-- PKG-2026-003: one courier payout reservation per completed order leg.
-- Replayed completion callbacks must not create a second leg-fee payout.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_records_leg_fee_unique
  ON payout_records(order_leg_id)
  WHERE order_leg_id IS NOT NULL AND type = 'leg_fee';

-- +goose Down
DROP INDEX IF EXISTS idx_payout_records_leg_fee_unique;
