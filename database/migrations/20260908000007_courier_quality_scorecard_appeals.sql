-- +goose Up
-- COURIER-2026-008: a courier can request review of a material quality
-- decision without submitting a client-generated score or enforcement result.
CREATE TABLE IF NOT EXISTS courier_quality_score_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scorecard_version VARCHAR(100) NOT NULL,
  metric_code VARCHAR(80) NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 10 AND 2000),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_quality_score_appeals_courier
  ON courier_quality_score_appeals(courier_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_courier_quality_score_appeals_open
  ON courier_quality_score_appeals(courier_id, scorecard_version, metric_code)
  WHERE status IN ('submitted', 'in_review');

-- +goose Down
DROP INDEX IF EXISTS uq_courier_quality_score_appeals_open;
DROP INDEX IF EXISTS idx_courier_quality_score_appeals_courier;
DROP TABLE IF EXISTS courier_quality_score_appeals;
