-- +goose Up

-- MWEB-PORTAL-P0-008: durable customer/courier support updates and private
-- evidence retention state. The notification worker calls the canonical
-- order-service communication endpoint; no notification is considered sent
-- until that endpoint accepts the idempotent event.
CREATE TABLE IF NOT EXISTS support_case_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_event_id UUID NOT NULL REFERENCES support_case_events(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'retry', 'sent', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(160),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_event_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_support_case_notification_outbox_ready
  ON support_case_notification_outbox(status, available_at, created_at)
  WHERE status IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS idx_support_case_notification_outbox_case
  ON support_case_notification_outbox(case_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON support_case_notification_outbox TO tembus_admin;

ALTER TABLE support_case_attachments
  ADD COLUMN IF NOT EXISTS retention_status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cleanup_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cleanup_error TEXT,
  ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE support_case_attachments
  DROP CONSTRAINT IF EXISTS support_case_attachments_retention_status_check;

ALTER TABLE support_case_attachments
  ADD CONSTRAINT support_case_attachments_retention_status_check CHECK (
    retention_status IN ('active', 'cleanup_pending', 'cleanup_failed', 'cleaned')
  );

CREATE INDEX IF NOT EXISTS idx_support_case_attachments_retention
  ON support_case_attachments(retention_status, expires_at, cleanup_attempts)
  WHERE retention_status IN ('active', 'cleanup_failed');

GRANT UPDATE ON support_case_attachments TO tembus_admin;

-- +goose Down
REVOKE UPDATE ON support_case_attachments FROM tembus_admin;
DROP INDEX IF EXISTS idx_support_case_attachments_retention;
ALTER TABLE support_case_attachments
  DROP CONSTRAINT IF EXISTS support_case_attachments_retention_status_check,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS cleaned_at,
  DROP COLUMN IF EXISTS last_cleanup_error,
  DROP COLUMN IF EXISTS cleanup_attempts,
  DROP COLUMN IF EXISTS retention_status;
REVOKE ALL ON support_case_notification_outbox FROM tembus_admin;
DROP INDEX IF EXISTS idx_support_case_notification_outbox_case;
DROP INDEX IF EXISTS idx_support_case_notification_outbox_ready;
DROP TABLE IF EXISTS support_case_notification_outbox;
