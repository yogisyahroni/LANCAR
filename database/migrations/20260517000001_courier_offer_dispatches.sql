-- +goose Up
CREATE TABLE IF NOT EXISTS courier_offer_dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_leg_id UUID REFERENCES order_legs(id) ON DELETE SET NULL,
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES zones(id),
  wave_number INT NOT NULL DEFAULT 1,
  rank_number INT NOT NULL,
  score NUMERIC(10,4) NOT NULL DEFAULT 0,
  distance_m INT NOT NULL DEFAULT 0,
  rating_snapshot NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  acceptance_rate_snapshot INT NOT NULL DEFAULT 100,
  completion_rate_snapshot INT NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'rejected', 'expired', 'skipped', 'cancelled', 'lost')),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  response_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courier_offer_dispatches_unique_courier_order UNIQUE (order_id, courier_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_offer_dispatches_one_active_order
  ON courier_offer_dispatches(order_id)
  WHERE status = 'offered';

CREATE INDEX IF NOT EXISTS idx_courier_offer_dispatches_courier_status
  ON courier_offer_dispatches(courier_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_offer_dispatches_order_rank
  ON courier_offer_dispatches(order_id, rank_number);

CREATE INDEX IF NOT EXISTS idx_courier_offer_dispatches_expiry
  ON courier_offer_dispatches(status, expires_at)
  WHERE status = 'offered';

-- +goose Down
DROP INDEX IF EXISTS idx_courier_offer_dispatches_expiry;
DROP INDEX IF EXISTS idx_courier_offer_dispatches_order_rank;
DROP INDEX IF EXISTS idx_courier_offer_dispatches_courier_status;
DROP INDEX IF EXISTS idx_courier_offer_dispatches_one_active_order;
DROP TABLE IF EXISTS courier_offer_dispatches;
