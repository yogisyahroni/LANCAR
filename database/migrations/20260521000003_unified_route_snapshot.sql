-- +goose Up
-- ============================================================
-- Unified route snapshot for on-demand customer, courier,
-- pricing, dispatch, and tracking contracts.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS route_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS route_provider VARCHAR(80),
  ADD COLUMN IF NOT EXISTS route_profile VARCHAR(30),
  ADD COLUMN IF NOT EXISTS route_distance_meters INT,
  ADD COLUMN IF NOT EXISTS route_duration_seconds INT,
  ADD COLUMN IF NOT EXISTS route_polyline TEXT,
  ADD COLUMN IF NOT EXISTS route_fallback_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_route_provider_created
  ON orders(route_provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_route_profile_created
  ON orders(route_profile, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_route_snapshot_gin
  ON orders USING GIN(route_snapshot);

ALTER TABLE courier_route_snapshots
  ALTER COLUMN provider TYPE VARCHAR(80),
  ADD COLUMN IF NOT EXISTS route_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS route_profile VARCHAR(30),
  ADD COLUMN IF NOT EXISTS route_distance_meters INT,
  ADD COLUMN IF NOT EXISTS route_duration_seconds INT,
  ADD COLUMN IF NOT EXISTS route_polyline TEXT,
  ADD COLUMN IF NOT EXISTS route_fallback_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_courier_route_snapshots_provider_created
  ON courier_route_snapshots(provider, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_route_snapshots_provider_created;

ALTER TABLE courier_route_snapshots
  DROP COLUMN IF EXISTS route_fallback_reason,
  DROP COLUMN IF EXISTS route_polyline,
  DROP COLUMN IF EXISTS route_duration_seconds,
  DROP COLUMN IF EXISTS route_distance_meters,
  DROP COLUMN IF EXISTS route_profile,
  DROP COLUMN IF EXISTS route_snapshot;

ALTER TABLE courier_route_snapshots
  ALTER COLUMN provider TYPE VARCHAR(30);

DROP INDEX IF EXISTS idx_orders_route_snapshot_gin;
DROP INDEX IF EXISTS idx_orders_route_profile_created;
DROP INDEX IF EXISTS idx_orders_route_provider_created;

ALTER TABLE orders
  DROP COLUMN IF EXISTS route_fallback_reason,
  DROP COLUMN IF EXISTS route_polyline,
  DROP COLUMN IF EXISTS route_duration_seconds,
  DROP COLUMN IF EXISTS route_distance_meters,
  DROP COLUMN IF EXISTS route_profile,
  DROP COLUMN IF EXISTS route_provider,
  DROP COLUMN IF EXISTS route_snapshot;
