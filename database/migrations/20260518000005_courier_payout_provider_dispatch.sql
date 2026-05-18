-- +goose Up
INSERT INTO system_configs (key, value, description, category) VALUES
('payout_dispatcher_enabled', 'true', 'Enable automatic dispatch for approved courier payout requests', 'finance'),
('payout_dispatcher_batch_size', '25', 'Maximum payout requests processed per dispatcher tick', 'finance'),
('payout_provider_name', '"stub"', 'Courier payout provider adapter name', 'finance')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS courier_payout_dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payout_request_id UUID NOT NULL REFERENCES courier_payout_requests(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_account_id UUID REFERENCES courier_payout_accounts(id) ON DELETE SET NULL,
  provider_name VARCHAR(40) NOT NULL,
  provider_reference TEXT,
  provider_status VARCHAR(24) NOT NULL DEFAULT 'processing'
    CHECK (provider_status IN ('processing', 'paid', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  request_payload_hash TEXT NOT NULL,
  response_hash TEXT,
  response_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  attempt_count INT NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_payout_dispatches_request_active
  ON courier_payout_dispatches(payout_request_id)
  WHERE provider_status IN ('processing', 'paid');

CREATE INDEX IF NOT EXISTS idx_courier_payout_dispatches_provider_ref
  ON courier_payout_dispatches(provider_name, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_courier_payout_dispatches_status
  ON courier_payout_dispatches(provider_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS courier_payout_provider_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_name VARCHAR(40) NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_reference TEXT,
  payload_hash TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  status VARCHAR(24),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courier_payout_provider_webhook_events_unique UNIQUE (provider_name, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_courier_payout_provider_webhook_events_ref
  ON courier_payout_provider_webhook_events(provider_name, provider_reference, created_at DESC)
  WHERE provider_reference IS NOT NULL;

ALTER TABLE courier_payout_requests
  ADD COLUMN IF NOT EXISTS provider_name VARCHAR(40),
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS provider_payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS provider_response_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_courier_payout_requests_provider_ref
  ON courier_payout_requests(provider_name, provider_reference)
  WHERE provider_reference IS NOT NULL;

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
      'observability_alert',
      'saldo_mismatch_detected'
    ));

DROP INDEX IF EXISTS idx_courier_payout_requests_provider_ref;
ALTER TABLE courier_payout_requests
  DROP COLUMN IF EXISTS provider_response_hash,
  DROP COLUMN IF EXISTS provider_payload_hash,
  DROP COLUMN IF EXISTS provider_reference,
  DROP COLUMN IF EXISTS provider_name;

DROP INDEX IF EXISTS idx_courier_payout_dispatches_status;
DROP INDEX IF EXISTS idx_courier_payout_provider_webhook_events_ref;
DROP TABLE IF EXISTS courier_payout_provider_webhook_events;
DROP INDEX IF EXISTS idx_courier_payout_dispatches_provider_ref;
DROP INDEX IF EXISTS idx_courier_payout_dispatches_request_active;
DROP TABLE IF EXISTS courier_payout_dispatches;

DELETE FROM system_configs
WHERE key IN (
  'payout_dispatcher_enabled',
  'payout_dispatcher_batch_size',
  'payout_provider_name'
);
