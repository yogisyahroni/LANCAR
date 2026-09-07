-- +goose Up
-- GEO-2026-005: versioned, market-scoped service zones with approval history.

-- PostgreSQL cannot alter a column referenced by a materialized view. Preserve
-- those view definitions/indexes while widening Polygon to MultiPolygon.
CREATE TEMP TABLE _geo005_materialized_views (
  schema_name TEXT NOT NULL,
  view_name TEXT NOT NULL,
  view_definition TEXT NOT NULL,
  index_definitions TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _geo005_materialized_views (schema_name, view_name, view_definition, index_definitions)
SELECT n.nspname,
       c.relname,
       rtrim(pg_get_viewdef(c.oid, true), '; '),
       COALESCE(array_agg(pi.indexdef) FILTER (WHERE pi.indexdef IS NOT NULL), ARRAY[]::TEXT[])
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_indexes pi ON pi.schemaname = n.nspname AND pi.tablename = c.relname
WHERE c.relkind = 'm'
  AND pg_get_viewdef(c.oid, true) ILIKE '%zones%'
GROUP BY n.nspname, c.relname, c.oid;

-- +goose StatementBegin
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN SELECT schema_name, view_name FROM _geo005_materialized_views LOOP
    EXECUTE format('DROP MATERIALIZED VIEW %I.%I', item.schema_name, item.view_name);
  END LOOP;
END $$;
-- +goose StatementEnd

ALTER TABLE zones
  ALTER COLUMN polygon TYPE GEOGRAPHY(GEOMETRY, 4326)
    USING polygon::geography,
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(32) NOT NULL DEFAULT 'ID-JK',
  ADD COLUMN IF NOT EXISTS geometry_version INT NOT NULL DEFAULT 1,
  ADD CONSTRAINT zones_geometry_version_positive CHECK (geometry_version > 0),
  ADD CONSTRAINT zones_market_code_not_blank CHECK (BTRIM(market_code) <> ''),
  ADD CONSTRAINT zones_polygon_supported_type CHECK (ST_GeometryType(polygon::geometry) IN ('ST_Polygon', 'ST_MultiPolygon'));

CREATE INDEX IF NOT EXISTS idx_zones_market_active ON zones(market_code, is_active);

CREATE TABLE IF NOT EXISTS zone_revisions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id           UUID NOT NULL REFERENCES zones(id),
    revision_number   INT NOT NULL,
    market_code       VARCHAR(32) NOT NULL,
    name              VARCHAR(100) NOT NULL,
    code              VARCHAR(20) NOT NULL,
    polygon           GEOGRAPHY(GEOMETRY, 4326) NOT NULL,
    is_active         BOOLEAN NOT NULL,
    max_couriers      INT NOT NULL,
    status            VARCHAR(16) NOT NULL CHECK (status IN ('draft', 'approved', 'published', 'rolled_back')),
    change_reason     TEXT NOT NULL,
    created_by        UUID,
    approved_by       UUID,
    approved_at       TIMESTAMPTZ,
    published_at      TIMESTAMPTZ,
    rollback_of       UUID REFERENCES zone_revisions(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(zone_id, revision_number),
    CHECK (BTRIM(market_code) <> ''),
    CHECK (max_couriers > 0),
    CHECK (ST_GeometryType(polygon::geometry) IN ('ST_Polygon', 'ST_MultiPolygon'))
);

CREATE INDEX IF NOT EXISTS idx_zone_revisions_zone_status ON zone_revisions(zone_id, status, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_zone_revisions_market ON zone_revisions(market_code, status);

INSERT INTO zone_revisions (
  zone_id, revision_number, market_code, name, code, polygon, is_active,
  max_couriers, status, change_reason, published_at
)
SELECT id, geometry_version, market_code, name, code, polygon, is_active,
       max_couriers, 'published', 'Initial versioned zone baseline', updated_at
FROM zones z
WHERE NOT EXISTS (
  SELECT 1 FROM zone_revisions zr WHERE zr.zone_id = z.id AND zr.revision_number = z.geometry_version
);

-- Existing orders keep their captured zone_id. Zone changes affect new
-- eligibility lookups only; they do not null out active order assignments.

-- +goose StatementBegin
DO $$
DECLARE
  item RECORD;
  index_definition TEXT;
BEGIN
  FOR item IN SELECT * FROM _geo005_materialized_views LOOP
    EXECUTE format('CREATE MATERIALIZED VIEW %I.%I AS %s WITH DATA', item.schema_name, item.view_name, item.view_definition);
    FOREACH index_definition IN ARRAY item.index_definitions LOOP
      EXECUTE index_definition;
    END LOOP;
  END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS zone_revisions;
DROP INDEX IF EXISTS idx_zone_revisions_zone_status;
DROP INDEX IF EXISTS idx_zone_revisions_market;
DROP INDEX IF EXISTS idx_zones_market_active;
ALTER TABLE zones
  DROP CONSTRAINT IF EXISTS zones_geometry_version_positive,
  DROP CONSTRAINT IF EXISTS zones_market_code_not_blank,
  DROP CONSTRAINT IF EXISTS zones_polygon_supported_type,
  DROP COLUMN IF EXISTS geometry_version,
  DROP COLUMN IF EXISTS market_code;

CREATE TEMP TABLE _geo005_materialized_views_down (
  schema_name TEXT NOT NULL,
  view_name TEXT NOT NULL,
  view_definition TEXT NOT NULL,
  index_definitions TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _geo005_materialized_views_down (schema_name, view_name, view_definition, index_definitions)
SELECT n.nspname,
       c.relname,
       rtrim(pg_get_viewdef(c.oid, true), '; '),
       COALESCE(array_agg(pi.indexdef) FILTER (WHERE pi.indexdef IS NOT NULL), ARRAY[]::TEXT[])
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_indexes pi ON pi.schemaname = n.nspname AND pi.tablename = c.relname
WHERE c.relkind = 'm'
  AND pg_get_viewdef(c.oid, true) ILIKE '%zones%'
GROUP BY n.nspname, c.relname, c.oid;

-- +goose StatementBegin
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN SELECT schema_name, view_name FROM _geo005_materialized_views_down LOOP
    EXECUTE format('DROP MATERIALIZED VIEW %I.%I', item.schema_name, item.view_name);
  END LOOP;
END $$;
-- +goose StatementEnd

ALTER TABLE zones
  ALTER COLUMN polygon TYPE GEOGRAPHY(POLYGON, 4326)
    USING polygon::geography;

-- +goose StatementBegin
DO $$
DECLARE
  item RECORD;
  index_definition TEXT;
BEGIN
  FOR item IN SELECT * FROM _geo005_materialized_views_down LOOP
    EXECUTE format('CREATE MATERIALIZED VIEW %I.%I AS %s WITH DATA', item.schema_name, item.view_name, item.view_definition);
    FOREACH index_definition IN ARRAY item.index_definitions LOOP
      EXECUTE index_definition;
    END LOOP;
  END LOOP;
END $$;
-- +goose StatementEnd
