-- +goose Up
-- ============================================================
-- LANCAR — FB-088: Batching driver food delivery
-- 2 order food dari MERCHANT SAMA + dropoff berdekatan (≤ 1.5 km)
-- digabung jadi 1 trip → courier pickup sekali, antar dua titik.
--
-- Design (GATE SLA-safe):
--   * Pairing HANYA saat kedua order sudah `searching` (matching driver
--     sudah dimulai 5 menit sebelum makanan siap — overlap dgn prep window,
--     jadi tidak ada delay ETA tambahan).
--   * Timebox pairing ≤ 2 menit; tanpa pasangan → order jalan solo.
--   * Max 2 order per batch, radius antar-dropoff ≤ 1.5 km (detour bounded).
--   * orders.batch_id (sudah ada sejak 20260610000003) dipakai sebagai
--     penanda batch; food_batches hanya untuk tracking/rekonsiliasi.
-- ============================================================

CREATE TABLE IF NOT EXISTS food_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  courier_id UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'forming'
    CHECK (status IN ('forming', 'assigned', 'in_progress', 'completed', 'cancelled')),
  order_a_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_b_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  dropoff_distance_m INT NOT NULL DEFAULT 0,
  max_eta_minutes INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_a_id),
  UNIQUE (order_b_id)
);

CREATE INDEX IF NOT EXISTS idx_food_batches_status ON food_batches(status);
CREATE INDEX IF NOT EXISTS idx_food_batches_merchant ON food_batches(merchant_id);
CREATE INDEX IF NOT EXISTS idx_food_batches_created ON food_batches(created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS food_batches;
