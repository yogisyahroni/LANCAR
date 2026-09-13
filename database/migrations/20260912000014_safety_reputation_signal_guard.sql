-- SAFE-2026-009: one reviewed safety incident may emit one reputation signal.
-- The action log remains append-only; this unique expression prevents a retry
-- or concurrent reviewer from applying the same source incident twice.
-- +goose Up
CREATE UNIQUE INDEX IF NOT EXISTS uq_reputation_actions_safety_incident_signal
  ON reputation_actions ((evidence_snapshot->>'source_incident_id'))
  WHERE action = 'QUALITY_RECALCULATE'
    AND evidence_snapshot ? 'source_incident_id';

-- +goose Down
DROP INDEX IF EXISTS uq_reputation_actions_safety_incident_signal;
