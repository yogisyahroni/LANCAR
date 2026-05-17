-- +goose Up
ALTER TABLE courier_payout_security_events
  DROP CONSTRAINT IF EXISTS courier_payout_security_events_event_type_check;

ALTER TABLE courier_payout_security_events
  ALTER COLUMN courier_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(40),
  ADD COLUMN IF NOT EXISTS subject_type VARCHAR(60),
  ADD COLUMN IF NOT EXISTS subject_id UUID,
  ADD COLUMN IF NOT EXISTS old_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS new_status VARCHAR(40),
  ADD CONSTRAINT courier_payout_security_events_event_type_check
    CHECK (event_type IN (
      'summary_viewed',
      'request_list_viewed',
      'step_up_failed',
      'request_blocked',
      'request_created',
      'account_status_changed',
      'request_status_changed',
      'observability_alert',
      'saldo_mismatch_detected'
    ));

CREATE INDEX IF NOT EXISTS idx_courier_payout_security_events_actor
  ON courier_payout_security_events(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_payout_security_events_subject
  ON courier_payout_security_events(subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_payout_security_events_severity
  ON courier_payout_security_events(severity, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_payout_security_events_severity;
DROP INDEX IF EXISTS idx_courier_payout_security_events_subject;
DROP INDEX IF EXISTS idx_courier_payout_security_events_actor;

ALTER TABLE courier_payout_security_events
  DROP CONSTRAINT IF EXISTS courier_payout_security_events_event_type_check;

ALTER TABLE courier_payout_security_events
  DROP COLUMN IF EXISTS new_status,
  DROP COLUMN IF EXISTS old_status,
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS subject_type,
  DROP COLUMN IF EXISTS actor_role,
  DROP COLUMN IF EXISTS actor_id;

DELETE FROM courier_payout_security_events
WHERE courier_id IS NULL;

ALTER TABLE courier_payout_security_events
  ALTER COLUMN courier_id SET NOT NULL,
  ADD CONSTRAINT courier_payout_security_events_event_type_check
    CHECK (event_type IN (
      'summary_viewed',
      'request_list_viewed',
      'step_up_failed',
      'request_blocked',
      'request_created'
    ));
