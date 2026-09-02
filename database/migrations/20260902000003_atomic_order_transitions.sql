-- +goose Up
-- CORE-2026-004: make lifecycle audit/proof effects replay-safe and
-- transactionally coupled to the order state mutation.

ALTER TABLE order_events
  ADD COLUMN IF NOT EXISTS actor_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(40),
  ADD COLUMN IF NOT EXISTS from_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS to_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_events_transition_idempotency
  ON order_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_events_order_transition
  ON order_events (order_id, created_at DESC, to_status);

ALTER TABLE package_scans
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS idx_package_scans_idempotency
  ON package_scans (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE order_events
  DROP CONSTRAINT IF EXISTS order_admin_override_reason_check,
  ADD CONSTRAINT order_admin_override_reason_check
    CHECK (event_type <> 'order.admin_override' OR NULLIF(BTRIM(reason), '') IS NOT NULL);

-- +goose Down
ALTER TABLE order_events
  DROP CONSTRAINT IF EXISTS order_admin_override_reason_check;
DROP INDEX IF EXISTS idx_package_scans_idempotency;
ALTER TABLE package_scans DROP COLUMN IF EXISTS idempotency_key;
DROP INDEX IF EXISTS idx_order_events_order_transition;
DROP INDEX IF EXISTS idx_order_events_transition_idempotency;
ALTER TABLE order_events
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS reason,
  DROP COLUMN IF EXISTS to_status,
  DROP COLUMN IF EXISTS from_status,
  DROP COLUMN IF EXISTS actor_role,
  DROP COLUMN IF EXISTS actor_id;
