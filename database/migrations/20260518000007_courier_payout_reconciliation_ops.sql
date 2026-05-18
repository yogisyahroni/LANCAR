-- +goose Up
INSERT INTO system_configs (key, value, description, category) VALUES
('payout_provider_latency_alert_minutes', '30', 'Alert when provider payout stays processing longer than this threshold', 'finance'),
('payout_pending_too_long_minutes', '60', 'Alert when payout request stays active without provider completion longer than this threshold', 'finance'),
('payout_webhook_missing_minutes', '20', 'Alert when provider webhook is not received after dispatch threshold', 'finance')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS courier_payout_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'failed')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_items INT NOT NULL DEFAULT 0,
  mismatch_count INT NOT NULL DEFAULT 0,
  alert_count INT NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_payout_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES courier_payout_reconciliation_runs(id) ON DELETE CASCADE,
  payout_request_id UUID REFERENCES courier_payout_requests(id) ON DELETE SET NULL,
  courier_id UUID REFERENCES users(id) ON DELETE SET NULL,
  check_type VARCHAR(40) NOT NULL
    CHECK (check_type IN (
      'ledger_vs_request',
      'request_vs_provider',
      'paid_amount_vs_ledger',
      'provider_latency_high',
      'pending_too_long',
      'webhook_missing'
    )),
  severity VARCHAR(16) NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  expected_value TEXT,
  actual_value TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_payout_reconciliation_runs_created
  ON courier_payout_reconciliation_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_payout_reconciliation_items_run
  ON courier_payout_reconciliation_items(run_id, severity, check_type);

CREATE INDEX IF NOT EXISTS idx_courier_payout_reconciliation_items_request
  ON courier_payout_reconciliation_items(payout_request_id, created_at DESC)
  WHERE payout_request_id IS NOT NULL;

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
      'observability_alert',
      'saldo_mismatch_detected'
    ));

DROP INDEX IF EXISTS idx_courier_payout_reconciliation_items_request;
DROP INDEX IF EXISTS idx_courier_payout_reconciliation_items_run;
DROP INDEX IF EXISTS idx_courier_payout_reconciliation_runs_created;
DROP TABLE IF EXISTS courier_payout_reconciliation_items;
DROP TABLE IF EXISTS courier_payout_reconciliation_runs;

DELETE FROM system_configs
WHERE key IN (
  'payout_provider_latency_alert_minutes',
  'payout_pending_too_long_minutes',
  'payout_webhook_missing_minutes'
);
