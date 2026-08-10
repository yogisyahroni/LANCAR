-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-009: driver_penalty_log
-- Kategorisasi ghosting: silent_cancel / soft_ghosting / coerced_cancel
-- ============================================================

CREATE TABLE IF NOT EXISTS driver_penalty_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES courier_profiles(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  violation_type VARCHAR(30) NOT NULL
    CHECK (violation_type IN ('silent_cancel', 'soft_ghosting', 'coerced_cancel', 'no_show_pickup')),
  amount_deducted BIGINT NOT NULL DEFAULT 0,
  evidence_ref TEXT NULL,
  appeal_status VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (appeal_status IN ('none', 'submitted', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_penalty_log_driver
  ON driver_penalty_log(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_penalty_log_order
  ON driver_penalty_log(order_id);

-- +goose Down
DROP TABLE IF EXISTS driver_penalty_log;
