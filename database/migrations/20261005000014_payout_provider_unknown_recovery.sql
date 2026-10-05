-- +goose Up
-- Provider timeouts/ambiguous responses must remain retryable and must not
-- create a second payout dispatch. The payout request stays processing until
-- a webhook or the recovery poll resolves it to paid/failed.
ALTER TABLE courier_payout_dispatches
  DROP CONSTRAINT IF EXISTS courier_payout_dispatches_provider_status_check;

ALTER TABLE courier_payout_dispatches
  ADD CONSTRAINT courier_payout_dispatches_provider_status_check
    CHECK (provider_status IN ('processing', 'unknown', 'paid', 'failed'));

DROP INDEX IF EXISTS idx_courier_payout_dispatches_request_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_payout_dispatches_request_active
  ON courier_payout_dispatches(payout_request_id)
  WHERE provider_status IN ('processing', 'unknown', 'paid');

CREATE INDEX IF NOT EXISTS idx_courier_payout_dispatches_unknown_recovery
  ON courier_payout_dispatches(updated_at)
  WHERE provider_status = 'unknown';

INSERT INTO system_configs (key, value, description, category) VALUES
('payout_provider_poll_batch_size', '25', 'Maximum ambiguous payout dispatches checked by recovery polling per tick', 'finance')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs WHERE key = 'payout_provider_poll_batch_size';
DROP INDEX IF EXISTS idx_courier_payout_dispatches_unknown_recovery;
DROP INDEX IF EXISTS idx_courier_payout_dispatches_request_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_payout_dispatches_request_active
  ON courier_payout_dispatches(payout_request_id)
  WHERE provider_status IN ('processing', 'paid');
ALTER TABLE courier_payout_dispatches
  DROP CONSTRAINT IF EXISTS courier_payout_dispatches_provider_status_check;
ALTER TABLE courier_payout_dispatches
  ADD CONSTRAINT courier_payout_dispatches_provider_status_check
    CHECK (provider_status IN ('processing', 'paid', 'failed'));
