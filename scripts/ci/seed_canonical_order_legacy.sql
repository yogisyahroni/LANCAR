-- Seed legacy facts before CORE-2026-001 is applied so the migration's
-- backfill is exercised by the migration-test job.

INSERT INTO users (phone_number, full_name, role)
VALUES ('+629999000001', 'Canonical Contract CI Fixture', 'customer');

INSERT INTO orders (
  order_number,
  customer_id,
  model,
  status,
  pickup_location,
  pickup_address,
  dropoff_location,
  dropoff_address,
  base_price_idr,
  total_price_idr,
  ppn_idr,
  mdr_idr,
  service_sub_type,
  service_snapshot,
  logistics_provider
)
SELECT fixture.order_number,
       u.id,
       'p2p',
       'pending_payment',
       ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326),
       'canonical contract pickup',
       ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326),
       'canonical contract dropoff',
       100000,
       100000,
       0,
       0,
       fixture.service_sub_type,
       fixture.service_snapshot,
       fixture.logistics_provider
FROM (SELECT id FROM users WHERE phone_number = '+629999000001') AS u
CROSS JOIN (VALUES
  ('ci-canonical-package', NULL::varchar, NULL::jsonb, NULL::varchar),
  ('ci-canonical-food', 'food_delivery'::varchar, NULL::jsonb, NULL::varchar),
  ('ci-canonical-snapshot-food', NULL::varchar, '{"service_category":"food"}'::jsonb, NULL::varchar),
  ('ci-canonical-tambal', 'tambal_ban_motor'::varchar, NULL::jsonb, NULL::varchar),
  ('ci-canonical-towing', 'towing_mobil'::varchar, NULL::jsonb, NULL::varchar),
  ('ci-canonical-aggregator', NULL::varchar, NULL::jsonb, 'jne'::varchar)
) AS fixture(order_number, service_sub_type, service_snapshot, logistics_provider);
