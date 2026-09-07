-- +goose Up
-- GEO-2026-007: purpose/market scoped raw location retention and access policy.

ALTER TABLE courier_locations
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(32) NOT NULL DEFAULT 'ID-JK',
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(32) NOT NULL DEFAULT 'active_delivery',
  ADD COLUMN IF NOT EXISTS retention_class VARCHAR(16) NOT NULL DEFAULT 'operational';

ALTER TABLE courier_locations
  DROP CONSTRAINT IF EXISTS courier_locations_market_code_check,
  DROP CONSTRAINT IF EXISTS courier_locations_purpose_check,
  DROP CONSTRAINT IF EXISTS courier_locations_retention_class_check;

ALTER TABLE courier_locations
  ADD CONSTRAINT courier_locations_market_code_check
    CHECK (market_code ~ '^[A-Z0-9_-]{2,32}$'),
  ADD CONSTRAINT courier_locations_purpose_check
    CHECK (purpose IN ('active_delivery', 'safety_review', 'support_review')),
  ADD CONSTRAINT courier_locations_retention_class_check
    CHECK (retention_class IN ('operational', 'forensic'));

CREATE INDEX IF NOT EXISTS idx_courier_locations_geo_retention
  ON courier_locations(market_code, purpose, retention_class, recorded_at);

CREATE TABLE IF NOT EXISTS geo_retention_policies (
  market_code     VARCHAR(32) NOT NULL,
  purpose         VARCHAR(32) NOT NULL,
  retention_class VARCHAR(16) NOT NULL,
  retention_days  INTEGER NOT NULL CHECK (retention_days BETWEEN 1 AND 730),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market_code, purpose, retention_class),
  CHECK (market_code ~ '^[A-Z0-9_-]{2,32}$'),
  CHECK (purpose IN ('active_delivery', 'safety_review', 'support_review')),
  CHECK (retention_class IN ('operational', 'forensic'))
);

INSERT INTO geo_retention_policies (market_code, purpose, retention_class, retention_days)
VALUES
  ('ID-JK', 'active_delivery', 'operational', 30),
  ('ID-JK', 'active_delivery', 'forensic', 90),
  ('ID-JK', 'safety_review', 'operational', 90),
  ('ID-JK', 'safety_review', 'forensic', 90),
  ('ID-JK', 'support_review', 'operational', 30),
  ('ID-JK', 'support_review', 'forensic', 90)
ON CONFLICT (market_code, purpose, retention_class) DO NOTHING;

-- Cleanup is deliberately keyed by all three dimensions. Unknown markets or
-- purposes are retained until an explicit policy exists, avoiding silent loss.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION tembus_cleanup_courier_locations(
  dry_run BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  market_code     TEXT,
  purpose         TEXT,
  retention_class TEXT,
  rows_deleted    BIGINT,
  retention_days  INTEGER
) AS $$
DECLARE
  policy RECORD;
  affected BIGINT;
BEGIN
  FOR policy IN
    SELECT p.market_code, p.purpose, p.retention_class, p.retention_days
    FROM geo_retention_policies p
    ORDER BY p.market_code, p.purpose, p.retention_class
  LOOP
    IF dry_run THEN
      SELECT COUNT(*) INTO affected
      FROM courier_locations cl
      WHERE cl.market_code = policy.market_code
        AND cl.purpose = policy.purpose
        AND cl.retention_class = policy.retention_class
        AND cl.recorded_at < NOW() - make_interval(days => policy.retention_days);
    ELSE
      DELETE FROM courier_locations cl
      WHERE cl.market_code = policy.market_code
        AND cl.purpose = policy.purpose
        AND cl.retention_class = policy.retention_class
        AND cl.recorded_at < NOW() - make_interval(days => policy.retention_days);
      GET DIAGNOSTICS affected = ROW_COUNT;
    END IF;

    RETURN QUERY SELECT policy.market_code::TEXT, policy.purpose::TEXT,
      policy.retention_class::TEXT, affected, policy.retention_days;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

COMMENT ON FUNCTION tembus_cleanup_courier_locations(BOOLEAN) IS
'Purpose/market scoped cleanup for raw courier locations. Rows without a matching policy are retained.';

-- +goose Down
DROP FUNCTION IF EXISTS tembus_cleanup_courier_locations(BOOLEAN);
DROP TABLE IF EXISTS geo_retention_policies;
DROP INDEX IF EXISTS idx_courier_locations_geo_retention;
ALTER TABLE courier_locations
  DROP CONSTRAINT IF EXISTS courier_locations_retention_class_check,
  DROP CONSTRAINT IF EXISTS courier_locations_purpose_check,
  DROP CONSTRAINT IF EXISTS courier_locations_market_code_check,
  DROP COLUMN IF EXISTS retention_class,
  DROP COLUMN IF EXISTS purpose,
  DROP COLUMN IF EXISTS market_code;
