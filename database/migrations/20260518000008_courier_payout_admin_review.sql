-- +goose Up
ALTER TABLE courier_payout_requests
  ADD COLUMN IF NOT EXISTS review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_courier_payout_requests_manual_review_queue
  ON courier_payout_requests(status, requested_at ASC)
  WHERE status IN ('risk_hold', 'manual_review', 'under_review', 'blocked');

ALTER TABLE courier_payout_security_events
  DROP CONSTRAINT IF EXISTS courier_payout_security_events_event_type_check;

ALTER TABLE courier_payout_security_events
  ADD CONSTRAINT courier_payout_security_events_event_type_check
    CHECK (event_type IN (
      'summary_viewed',
      'request_list_viewed',
      'step_up_failed',
      'request_blocked',
      'request_created',
      'account_status_changed',
      'request_status_changed',
      'risk_decision_created',
      'payout_dispatch_created',
      'payout_provider_callback',
      'payout_provider_signature_failed',
      'payout_reconciliation_run',
      'payout_review_action',
      'observability_alert',
      'saldo_mismatch_detected'
    ));

-- +goose Down
ALTER TABLE courier_payout_security_events
  DROP CONSTRAINT IF EXISTS courier_payout_security_events_event_type_check;

ALTER TABLE courier_payout_security_events
  ADD CONSTRAINT courier_payout_security_events_event_type_check
    CHECK (event_type IN (
      'summary_viewed',
      'request_list_viewed',
      'step_up_failed',
      'request_blocked',
      'request_created',
      'account_status_changed',
      'request_status_changed',
      'risk_decision_created',
      'payout_dispatch_created',
      'payout_provider_callback',
      'payout_provider_signature_failed',
      'payout_reconciliation_run',
      'observability_alert',
      'saldo_mismatch_detected'
    ));

DROP INDEX IF EXISTS idx_courier_payout_requests_manual_review_queue;

ALTER TABLE courier_payout_requests
  DROP COLUMN IF EXISTS review_metadata;
