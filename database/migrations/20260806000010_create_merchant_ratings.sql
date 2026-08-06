-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-059: merchant_ratings
-- Struktur sama dengan courier_ratings, tapi untuk merchant
-- ============================================================

CREATE TABLE IF NOT EXISTS merchant_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  rated_by UUID NOT NULL REFERENCES users(id),
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT NULL,
  tags TEXT[] NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_ratings_merchant
  ON merchant_ratings(merchant_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS merchant_ratings;
