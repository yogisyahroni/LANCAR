-- +goose Up
-- Operator workflow for rejected/spoof-risk courier proof attempts.
-- The proof attempt remains immutable; this table stores the operational action.
CREATE TABLE IF NOT EXISTS courier_gps_risk_actions (
  proof_attempt_id UUID PRIMARY KEY REFERENCES courier_proof_attempts(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  actor_id UUID NOT NULL REFERENCES users(id),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_gps_risk_actions_status
  ON courier_gps_risk_actions(status, updated_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_gps_risk_actions_status;
DROP TABLE IF EXISTS courier_gps_risk_actions;
