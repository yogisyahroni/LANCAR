-- +goose Up
-- MERCH-2026-004: canonical merchant operating state, timezone-aware
-- schedule projection, temporary closure overrides, and audit history.

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS operating_state VARCHAR(16) NOT NULL DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS operating_state_reason TEXT,
  ADD COLUMN IF NOT EXISTS operating_state_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operating_state_updated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS operating_state_source VARCHAR(24) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS operating_state_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS operating_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta';

-- Existing pause/busy/open facts are projected into the canonical state before
-- the new state is exposed to discovery and order-service.
UPDATE merchants m
SET operating_state = CASE
      WHEN EXISTS (
        SELECT 1 FROM merchant_special_closures closure
        WHERE closure.merchant_id = m.id AND closure.closure_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
      ) THEN 'holiday'
      WHEN m.paused_until IS NOT NULL AND m.paused_until > NOW() THEN 'paused'
      WHEN m.busy_until IS NOT NULL AND m.busy_until > NOW() AND m.is_open THEN 'busy'
      WHEN m.is_open THEN 'open'
      ELSE 'closed'
    END,
    operating_state_reason = CASE
      WHEN EXISTS (
        SELECT 1 FROM merchant_special_closures closure
        WHERE closure.merchant_id = m.id AND closure.closure_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
      ) THEN 'legacy_special_closure'
      WHEN m.paused_until IS NOT NULL AND m.paused_until > NOW() THEN 'legacy_pause'
      WHEN m.busy_until IS NOT NULL AND m.busy_until > NOW() AND m.is_open THEN 'legacy_busy'
      ELSE NULL
    END,
    operating_state_until = CASE
      WHEN m.paused_until IS NOT NULL AND m.paused_until > NOW() THEN m.paused_until
      WHEN m.busy_until IS NOT NULL AND m.busy_until > NOW() AND m.is_open THEN m.busy_until
      ELSE NULL
    END,
    operating_state_source = 'legacy',
    operating_state_version = GREATEST(operating_state_version, 1);

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchants_operating_state_check'
  ) THEN
    ALTER TABLE merchants
      ADD CONSTRAINT merchants_operating_state_check
      CHECK (operating_state IN ('open', 'closed', 'busy', 'paused', 'temp_closed', 'holiday'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchants_operating_state_source_check'
  ) THEN
    ALTER TABLE merchants
      ADD CONSTRAINT merchants_operating_state_source_check
      CHECK (operating_state_source IN ('legacy', 'merchant', 'schedule', 'admin_override', 'system'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchants_operating_state_version_check'
  ) THEN
    ALTER TABLE merchants
      ADD CONSTRAINT merchants_operating_state_version_check
      CHECK (operating_state_version > 0);
  END IF;
END $$;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_merchants_operating_state
  ON merchants (operating_state, operating_state_until, updated_at DESC);

CREATE TABLE IF NOT EXISTS merchant_operating_state_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  previous_state VARCHAR(16) NOT NULL,
  state VARCHAR(16) NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(BTRIM(reason)) BETWEEN 1 AND 500),
  effective_until TIMESTAMPTZ,
  actor_id UUID REFERENCES users(id),
  actor_role VARCHAR(32) NOT NULL DEFAULT 'system',
  source VARCHAR(24) NOT NULL,
  state_version BIGINT NOT NULL CHECK (state_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_operating_state_events_feed
  ON merchant_operating_state_events (merchant_id, created_at DESC);

-- State changes are consumed by Search/Ads eligibility and are kept in the
-- durable shared outbox, independent from catalog item events.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION emit_merchant_operating_state_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.operating_state IS NOT DISTINCT FROM OLD.operating_state
     AND NEW.operating_state_version IS NOT DISTINCT FROM OLD.operating_state_version THEN
    RETURN NEW;
  END IF;

  INSERT INTO event_outbox (aggregate_type, aggregate_id, event_type, event_version, payload, headers)
  VALUES (
    'merchant_operating_state',
    NEW.id,
    'merchant.operating_state.changed',
    1,
    jsonb_build_object(
      'merchant_id', NEW.id,
      'previous_state', OLD.operating_state,
      'state', NEW.operating_state,
      'reason', NEW.operating_state_reason,
      'effective_until', NEW.operating_state_until,
      'source', NEW.operating_state_source,
      'state_version', NEW.operating_state_version,
      'updated_at', NEW.updated_at
    ),
    jsonb_build_object(
      'consumers', jsonb_build_array('search-index', 'ads-eligibility'),
      'source_of_truth', 'merchant-service'
    )
  );
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_emit_merchant_operating_state_change ON merchants;
CREATE TRIGGER trg_emit_merchant_operating_state_change
AFTER UPDATE OF operating_state, operating_state_version ON merchants
FOR EACH ROW EXECUTE FUNCTION emit_merchant_operating_state_change();

-- +goose Down
DROP TRIGGER IF EXISTS trg_emit_merchant_operating_state_change ON merchants;
DROP FUNCTION IF EXISTS emit_merchant_operating_state_change();
DROP INDEX IF EXISTS idx_merchant_operating_state_events_feed;
DROP TABLE IF EXISTS merchant_operating_state_events;
DROP INDEX IF EXISTS idx_merchants_operating_state;
ALTER TABLE merchants
  DROP CONSTRAINT IF EXISTS merchants_operating_state_version_check,
  DROP CONSTRAINT IF EXISTS merchants_operating_state_source_check,
  DROP CONSTRAINT IF EXISTS merchants_operating_state_check,
  DROP COLUMN IF EXISTS operating_timezone,
  DROP COLUMN IF EXISTS operating_state_version,
  DROP COLUMN IF EXISTS operating_state_source,
  DROP COLUMN IF EXISTS operating_state_updated_by,
  DROP COLUMN IF EXISTS operating_state_until,
  DROP COLUMN IF EXISTS operating_state_reason,
  DROP COLUMN IF EXISTS operating_state;
