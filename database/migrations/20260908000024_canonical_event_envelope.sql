-- +goose Up
-- GLOB-2026-005: canonical, governed event metadata on the existing outbox.
-- The existing `id` remains the canonical event id. Legacy event_version/payload
-- columns remain available for consumers during the schema transition.

ALTER TABLE event_outbox
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS produced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(80) NOT NULL DEFAULT 'id-jk',
  ADD COLUMN IF NOT EXISTS service_name VARCHAR(120) NOT NULL DEFAULT 'admin-service',
  ADD COLUMN IF NOT EXISTS actor_pseudonymous_id VARCHAR(160) NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS entity_id TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(160) NOT NULL DEFAULT uuid_generate_v4()::text,
  ADD COLUMN IF NOT EXISTS trace_id VARCHAR(160) NOT NULL DEFAULT uuid_generate_v4()::text,
  ADD COLUMN IF NOT EXISTS pii_classification VARCHAR(32) NOT NULL DEFAULT 'restricted',
  ADD COLUMN IF NOT EXISTS field_pii_classification JSONB NOT NULL DEFAULT '{"payload":"restricted"}'::jsonb,
  ADD COLUMN IF NOT EXISTS retention_class VARCHAR(32) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(240) NOT NULL DEFAULT uuid_generate_v4()::text;

-- Backfill rows created before the canonical columns existed using the durable
-- outbox timestamps and aggregate identity. No raw actor identity is inferred.
UPDATE event_outbox
   SET schema_version = GREATEST(COALESCE(event_version, 1), 1),
       occurred_at = COALESCE(created_at, NOW()),
       produced_at = COALESCE(created_at, NOW()),
       entity_id = COALESCE(NULLIF(entity_id, 'unknown'), aggregate_id::text, event_type),
       field_pii_classification = CASE
         WHEN field_pii_classification = '{}'::jsonb THEN '{"payload":"restricted"}'::jsonb
         ELSE field_pii_classification
       END
 WHERE (schema_version = 1 AND event_version > 1)
    OR entity_id = 'unknown'
    OR field_pii_classification = '{}'::jsonb;

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_outbox_schema_version_positive') THEN
    ALTER TABLE event_outbox
      ADD CONSTRAINT event_outbox_schema_version_positive CHECK (schema_version > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_outbox_market_code_format') THEN
    ALTER TABLE event_outbox
      ADD CONSTRAINT event_outbox_market_code_format CHECK (market_code ~ '^[a-z]{2}-[a-z0-9-]+$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_outbox_pii_classification_valid') THEN
    ALTER TABLE event_outbox
      ADD CONSTRAINT event_outbox_pii_classification_valid
      CHECK (pii_classification IN ('public', 'internal', 'confidential', 'restricted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_outbox_retention_class_valid') THEN
    ALTER TABLE event_outbox
      ADD CONSTRAINT event_outbox_retention_class_valid
      CHECK (retention_class IN ('short', 'standard', 'financial', 'legal_hold'));
  END IF;
END $$;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_event_outbox_canonical_stream
  ON event_outbox (event_type, schema_version, occurred_at, id);

CREATE INDEX IF NOT EXISTS idx_event_outbox_dedupe
  ON event_outbox (dedupe_key, occurred_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_event_outbox_dedupe;
DROP INDEX IF EXISTS idx_event_outbox_canonical_stream;
ALTER TABLE event_outbox
  DROP CONSTRAINT IF EXISTS event_outbox_retention_class_valid,
  DROP CONSTRAINT IF EXISTS event_outbox_pii_classification_valid,
  DROP CONSTRAINT IF EXISTS event_outbox_market_code_format,
  DROP CONSTRAINT IF EXISTS event_outbox_schema_version_positive;
ALTER TABLE event_outbox
  DROP COLUMN IF EXISTS dedupe_key,
  DROP COLUMN IF EXISTS retention_class,
  DROP COLUMN IF EXISTS field_pii_classification,
  DROP COLUMN IF EXISTS pii_classification,
  DROP COLUMN IF EXISTS trace_id,
  DROP COLUMN IF EXISTS correlation_id,
  DROP COLUMN IF EXISTS entity_id,
  DROP COLUMN IF EXISTS actor_pseudonymous_id,
  DROP COLUMN IF EXISTS service_name,
  DROP COLUMN IF EXISTS market_code,
  DROP COLUMN IF EXISTS produced_at,
  DROP COLUMN IF EXISTS occurred_at,
  DROP COLUMN IF EXISTS schema_version;
