-- +goose Up
-- High-impact payment routing/config mutations are submitted as maker-checker
-- requests. The target catalog/health projection is changed only by approval.
CREATE TABLE IF NOT EXISTS payment_config_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_type VARCHAR(32) NOT NULL CHECK (change_type IN ('PROVIDER_HEALTH', 'METHOD_CATALOG')),
    requested_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    rejected_by UUID REFERENCES users(id),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REJECTED', 'APPLIED')),
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    reason TEXT NOT NULL,
    decision_reason TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,
    CONSTRAINT payment_config_change_requests_distinct_approver_ck
      CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE INDEX IF NOT EXISTS idx_payment_config_change_requests_queue
  ON payment_config_change_requests(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS payment_config_change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES payment_config_change_requests(id),
    event_type VARCHAR(16) NOT NULL CHECK (event_type IN ('REQUESTED', 'REJECTED', 'APPLIED')),
    actor_id UUID NOT NULL REFERENCES users(id),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_config_change_events_request
  ON payment_config_change_events(request_id, created_at ASC);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION reject_payment_config_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment_config_change_events is append-only; create a new event';
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_payment_config_change_events_immutable ON payment_config_change_events;
CREATE TRIGGER trg_payment_config_change_events_immutable
  BEFORE UPDATE OR DELETE ON payment_config_change_events
  FOR EACH ROW EXECUTE FUNCTION reject_payment_config_event_mutation();

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_config_change_events LIMIT 1)
     OR EXISTS (SELECT 1 FROM payment_config_change_requests LIMIT 1)
  THEN RAISE EXCEPTION 'payment config approval history exists; use a compensating migration'; END IF;
END $$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS trg_payment_config_change_events_immutable ON payment_config_change_events;
DROP FUNCTION IF EXISTS reject_payment_config_event_mutation();
DROP TABLE IF EXISTS payment_config_change_events;
DROP TABLE IF EXISTS payment_config_change_requests;
