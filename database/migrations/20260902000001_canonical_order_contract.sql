-- +goose Up
-- CORE-2026-001: canonical service-aware order envelope.
-- Legacy rows are mapped only from facts already present in orders/service_snapshot.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_category VARCHAR(40),
  ADD COLUMN IF NOT EXISTS contract_version VARCHAR(32) NOT NULL DEFAULT '2026-09-01',
  ADD COLUMN IF NOT EXISTS quote_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS service_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE orders
SET service_category = CASE
  WHEN LOWER(COALESCE(service_sub_type, '')) = 'food_delivery'
    OR LOWER(COALESCE(service_snapshot->>'service_category', '')) IN ('food', 'food_delivery') THEN 'food'
  WHEN LOWER(COALESCE(service_sub_type, '')) LIKE 'tambal_ban%'
    OR LOWER(COALESCE(service_snapshot->>'service_category', '')) = 'tambal_ban' THEN 'tambal_ban'
  WHEN LOWER(COALESCE(service_sub_type, '')) LIKE 'towing%'
    OR LOWER(COALESCE(service_snapshot->>'service_category', '')) = 'towing' THEN 'towing'
  WHEN NULLIF(logistics_provider, '') IS NOT NULL
    OR LOWER(COALESCE(model, '')) = 'aggregator'
    OR LOWER(COALESCE(service_snapshot->>'service_category', '')) = 'aggregator' THEN 'aggregator'
  WHEN LOWER(COALESCE(service_snapshot->>'service_category', '')) IN ('on_demand', 'regular', 'network', 'package_on_demand')
    OR LOWER(COALESCE(model, '')) IN ('p2p', 'two_legs', 'three_legs', 'hub_and_spoke') THEN 'package_on_demand'
  ELSE NULL
END
WHERE service_category IS NULL;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_canonical_service_category_check,
  ADD CONSTRAINT orders_canonical_service_category_check
    CHECK (service_category IS NULL OR service_category IN (
      'package_on_demand', 'food', 'tambal_ban', 'aggregator', 'towing'
    )),
  DROP CONSTRAINT IF EXISTS orders_state_version_positive_check,
  ADD CONSTRAINT orders_state_version_positive_check CHECK (state_version >= 1);

CREATE INDEX IF NOT EXISTS idx_orders_canonical_service_category
  ON orders(service_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_correlation_id
  ON orders(correlation_id) WHERE correlation_id IS NOT NULL;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION increment_order_state_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.state_version = GREATEST(COALESCE(OLD.state_version, 1) + 1, 1);
  END IF;
  NEW.updated_at = COALESCE(NEW.updated_at, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS orders_state_version_trigger ON orders;
CREATE TRIGGER orders_state_version_trigger
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION increment_order_state_version();

-- +goose Down
DROP TRIGGER IF EXISTS orders_state_version_trigger ON orders;
-- +goose StatementBegin
DROP FUNCTION IF EXISTS increment_order_state_version();
-- +goose StatementEnd
DROP INDEX IF EXISTS idx_orders_correlation_id;
DROP INDEX IF EXISTS idx_orders_canonical_service_category;
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_state_version_positive_check,
  DROP CONSTRAINT IF EXISTS orders_canonical_service_category_check,
  DROP COLUMN IF EXISTS service_metadata,
  DROP COLUMN IF EXISTS correlation_id,
  DROP COLUMN IF EXISTS state_version,
  DROP COLUMN IF EXISTS quote_id,
  DROP COLUMN IF EXISTS contract_version,
  DROP COLUMN IF EXISTS service_category;
