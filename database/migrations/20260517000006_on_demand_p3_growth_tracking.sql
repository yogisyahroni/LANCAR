-- +goose Up
DELETE FROM courier_earnings_ledger newer
USING courier_earnings_ledger older
WHERE newer.source = 'delivery'
  AND older.source = 'delivery'
  AND newer.order_id IS NOT NULL
  AND newer.courier_id = older.courier_id
  AND newer.order_id = older.order_id
  AND newer.id::text > older.id::text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_earnings_delivery_once
  ON courier_earnings_ledger(courier_id, order_id, source)
  WHERE source = 'delivery' AND order_id IS NOT NULL;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_courier_delivery_earning()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.courier_id IS NOT NULL AND NEW.status = 'delivered' AND COALESCE(NEW.assigned_fee_idr, 0) > 0 THEN
    INSERT INTO courier_earnings_ledger (
      courier_id,
      order_id,
      source,
      direction,
      amount_idr,
      settlement_status,
      description,
      metadata
    ) VALUES (
      NEW.courier_id,
      NEW.order_id,
      'delivery',
      'credit',
      NEW.assigned_fee_idr,
      'available',
      'Payout bersih pengantaran',
      jsonb_build_object('order_leg_id', NEW.id, 'synced_from', 'order_legs')
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_sync_courier_delivery_earning ON order_legs;
CREATE TRIGGER trg_sync_courier_delivery_earning
AFTER INSERT OR UPDATE OF status, assigned_fee_idr, courier_id
ON order_legs
FOR EACH ROW
EXECUTE FUNCTION sync_courier_delivery_earning();

INSERT INTO courier_earnings_ledger (
  courier_id,
  order_id,
  source,
  direction,
  amount_idr,
  settlement_status,
  description,
  metadata
)
SELECT
  ol.courier_id,
  ol.order_id,
  'delivery',
  'credit',
  ol.assigned_fee_idr,
  'available',
  'Payout bersih pengantaran',
  jsonb_build_object('order_leg_id', ol.id, 'synced_from', 'backfill')
FROM order_legs ol
WHERE ol.courier_id IS NOT NULL
  AND ol.status = 'delivered'
  AND COALESCE(ol.assigned_fee_idr, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM courier_earnings_ledger cel
    WHERE cel.order_id = ol.order_id
      AND cel.courier_id = ol.courier_id
      AND cel.source = 'delivery'
  )
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS courier_hotspot_rollups (
  zone_id UUID PRIMARY KEY REFERENCES zones(id) ON DELETE CASCADE,
  zone_name VARCHAR(100) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  active_orders INT NOT NULL DEFAULT 0,
  recent_orders INT NOT NULL DEFAULT 0,
  demand_score INT NOT NULL DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_courier_hotspot_rollups()
RETURNS void AS $$
BEGIN
  INSERT INTO courier_hotspot_rollups (
    zone_id,
    zone_name,
    latitude,
    longitude,
    active_orders,
    recent_orders,
    demand_score,
    last_order_at,
    refreshed_at
  )
  SELECT
    z.id,
    z.name,
    ST_Y(ST_Centroid(z.polygon::geometry))::double precision,
    ST_X(ST_Centroid(z.polygon::geometry))::double precision,
    COUNT(o.id) FILTER (WHERE o.status IN ('pending', 'pending_payment', 'paid', 'offered', 'dispatching'))::int,
    COUNT(o.id) FILTER (WHERE o.created_at >= NOW() - INTERVAL '2 hours')::int,
    LEAST(
      100,
      (
        COUNT(o.id) FILTER (WHERE o.status IN ('pending', 'pending_payment', 'paid', 'offered', 'dispatching')) * 18
        + COUNT(o.id) FILTER (WHERE o.created_at >= NOW() - INTERVAL '2 hours') * 8
      )
    )::int,
    MAX(o.created_at),
    NOW()
  FROM zones z
  LEFT JOIN orders o
    ON o.pickup_location IS NOT NULL
   AND ST_Contains(z.polygon::geometry, o.pickup_location::geometry)
  WHERE z.is_active = TRUE
  GROUP BY z.id, z.name, z.polygon
  ON CONFLICT (zone_id) DO UPDATE SET
    zone_name = EXCLUDED.zone_name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    active_orders = EXCLUDED.active_orders,
    recent_orders = EXCLUDED.recent_orders,
    demand_score = EXCLUDED.demand_score,
    last_order_at = EXCLUDED.last_order_at,
    refreshed_at = NOW();
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

SELECT refresh_courier_hotspot_rollups();

-- +goose Down
DROP FUNCTION IF EXISTS refresh_courier_hotspot_rollups();
DROP TABLE IF EXISTS courier_hotspot_rollups;
DROP TRIGGER IF EXISTS trg_sync_courier_delivery_earning ON order_legs;
DROP FUNCTION IF EXISTS sync_courier_delivery_earning();
DROP INDEX IF EXISTS idx_courier_earnings_delivery_once;
