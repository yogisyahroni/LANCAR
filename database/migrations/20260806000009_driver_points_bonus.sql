-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-010: driver_daily_points + driver_bonus_payout
-- Skema poin "tutup poin" harian/mingguan, self-scaling
-- ============================================================

CREATE TABLE IF NOT EXISTS driver_daily_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES courier_profiles(id),
  points_date DATE NOT NULL,
  points_earned INT NOT NULL DEFAULT 0,
  orders_completed INT NOT NULL DEFAULT 0,
  ghost_penalties INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (driver_id, points_date)
);

CREATE TABLE IF NOT EXISTS driver_bonus_payout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES courier_profiles(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  points_total INT NOT NULL DEFAULT 0,
  bonus_amount BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_daily_points_driver
  ON driver_daily_points(driver_id, points_date DESC);
CREATE INDEX IF NOT EXISTS idx_driver_bonus_payout_driver
  ON driver_bonus_payout(driver_id, status);

-- +goose Down
DROP TABLE IF EXISTS driver_bonus_payout;
DROP TABLE IF EXISTS driver_daily_points;
