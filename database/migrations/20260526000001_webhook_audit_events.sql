-- +goose Up
CREATE TABLE IF NOT EXISTS webhook_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_name TEXT NOT NULL,
  provider_event_id TEXT,
  provider_reference TEXT,
  event_type TEXT,
  payload_hash TEXT NOT NULL,
  signature_hash TEXT,
  verification_status TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received',
  raw_payload JSONB NOT NULL,
  error_code TEXT,
  source_ip TEXT,
  user_agent TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_audit_events_valid_event_unique
  ON webhook_audit_events(provider_name, provider_event_id)
  WHERE provider_event_id IS NOT NULL AND verification_status = 'valid';

CREATE INDEX IF NOT EXISTS idx_webhook_audit_events_provider_reference
  ON webhook_audit_events(provider_name, provider_reference, received_at DESC)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_audit_events_status
  ON webhook_audit_events(provider_name, verification_status, processing_status, received_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_webhook_audit_events_status;
DROP INDEX IF EXISTS idx_webhook_audit_events_provider_reference;
DROP INDEX IF EXISTS idx_webhook_audit_events_valid_event_unique;
DROP TABLE IF EXISTS webhook_audit_events;
