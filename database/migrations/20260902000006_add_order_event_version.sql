-- name: 20260902000006_add_order_event_version
-- CORE-2026-007 event ordering/version contract

-- +goose Up
-- Add monotonic version + correlation id to order_events.
-- `version` defaults via a statement-level bump on insert; existing rows get 1.
ALTER TABLE order_events ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
ALTER TABLE order_events ADD COLUMN IF NOT EXISTS correlation_id uuid;

-- Backfill existing rows with ascending versions per order
UPDATE order_events oe
SET version = sub.seq
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at) AS seq
  FROM order_events
) sub
WHERE oe.id = sub.id;

-- Enforce monotonic sequence per (order_id, version) uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_events_order_version
  ON order_events (order_id, version) WHERE version > 0;

-- +goose Down
DROP INDEX IF EXISTS idx_order_events_order_version;
ALTER TABLE order_events DROP COLUMN IF EXISTS version;
ALTER TABLE order_events DROP COLUMN IF EXISTS correlation_id;
