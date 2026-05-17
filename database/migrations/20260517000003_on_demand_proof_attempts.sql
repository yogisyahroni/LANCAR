-- +goose Up
CREATE TABLE IF NOT EXISTS courier_proof_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  courier_id UUID REFERENCES users(id) ON DELETE SET NULL,
  proof_step VARCHAR(20) NOT NULL CHECK (proof_step IN ('pickup', 'delivery')),
  proof_status VARCHAR(20) NOT NULL CHECK (proof_status IN ('accepted', 'rejected')),
  rejection_reason TEXT,
  distance_m INT,
  radius_m INT NOT NULL DEFAULT 150,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  spoof_risk VARCHAR(40) NOT NULL DEFAULT 'normal',
  barcode_value TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_proof_attempts_order_created
  ON courier_proof_attempts(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_proof_attempts_rejections
  ON courier_proof_attempts(proof_status, rejection_reason, created_at DESC)
  WHERE proof_status = 'rejected';

-- +goose Down
DROP INDEX IF EXISTS idx_courier_proof_attempts_rejections;
DROP INDEX IF EXISTS idx_courier_proof_attempts_order_created;
DROP TABLE IF EXISTS courier_proof_attempts;
