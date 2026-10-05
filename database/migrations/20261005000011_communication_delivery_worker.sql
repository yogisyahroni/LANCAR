-- +goose Up

-- Durable communication delivery processing. A worker may claim a row and
-- die; the recovery pass moves stale processing rows back to queued without
-- fabricating a successful delivery.
ALTER TABLE communication_deliveries
  DROP CONSTRAINT IF EXISTS communication_deliveries_status_check;

ALTER TABLE communication_deliveries
  ADD CONSTRAINT communication_deliveries_status_check
  CHECK (status IN ('queued','processing','sent','delivered','read','failed','suppressed','dead_letter'));

ALTER TABLE communication_deliveries
  ADD COLUMN IF NOT EXISTS notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(160);

CREATE INDEX IF NOT EXISTS idx_communication_deliveries_worker_claim
  ON communication_deliveries(status, next_attempt_at, locked_at, created_at);

-- +goose Down

DROP INDEX IF EXISTS idx_communication_deliveries_worker_claim;
ALTER TABLE communication_deliveries
  DROP COLUMN IF EXISTS locked_by,
  DROP COLUMN IF EXISTS locked_at,
  DROP COLUMN IF EXISTS notification_id;
ALTER TABLE communication_deliveries
  DROP CONSTRAINT IF EXISTS communication_deliveries_status_check;
ALTER TABLE communication_deliveries
  ADD CONSTRAINT communication_deliveries_status_check
  CHECK (status IN ('queued','sent','delivered','read','failed','suppressed','dead_letter'));
