-- +goose Up
ALTER TABLE delivery_service_products
  ADD COLUMN IF NOT EXISTS service_category VARCHAR(30) NOT NULL DEFAULT 'on_demand';

ALTER TABLE delivery_service_products
  ALTER COLUMN service_family SET DEFAULT 'regular';

ALTER TABLE delivery_service_products
  DROP CONSTRAINT IF EXISTS delivery_service_products_route_model_check,
  ADD CONSTRAINT delivery_service_products_route_model_check
    CHECK (route_model IN ('p2p', 'two_legs', 'three_legs', 'hub_and_spoke'));

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_model_check,
  ADD CONSTRAINT orders_model_check
    CHECK (model IN ('p2p', 'two_legs', 'three_legs', 'hub_and_spoke'));

UPDATE delivery_service_products
SET service_category = 'on_demand',
    service_family = 'express',
    route_model = 'p2p',
    updated_at = NOW()
WHERE code IN ('tembus_priority', 'tembus_instant');

UPDATE delivery_service_products
SET service_category = 'on_demand',
    service_family = 'regular',
    route_model = 'p2p',
    updated_at = NOW()
WHERE code = 'tembus_hemat';

UPDATE delivery_service_products
SET service_category = 'on_demand',
    service_family = 'regular',
    route_model = 'three_legs',
    updated_at = NOW()
WHERE code = 'tembus_same_day';

UPDATE delivery_service_products
SET service_category = 'on_demand',
    service_family = 'cargo',
    route_model = 'p2p',
    updated_at = NOW()
WHERE code = 'tembus_mobil';

INSERT INTO delivery_service_products (
  code, name, description, service_family, service_category, route_model, is_enabled, display_order,
  vehicle_types, exclusive_driver, batching_allowed, max_eta_minutes, max_distance_km, max_weight_kg,
  uses_size_tier, requires_dimension_scan, allows_manual_dimension, requires_pickup_verification,
  price_mode, base_fare_idr, included_distance_km, per_km_idr, service_multiplier,
  platform_commission_percent, courier_payout_percent, courier_min_payout_idr,
  mdr_percent, ppn_percent, show_customer_price_to_courier,
  size_tiers, dimension_rules, availability_rules, metadata
) VALUES
(
  'tembus_reg',
  'TEMBUS REG',
  'Service regular network parcel dengan alur pickup, inbound/outbound origin, inbound/outbound destination, delivery, dan POD.',
  'regular',
  'network',
  'hub_and_spoke',
  TRUE,
  60,
  ARRAY['motor'],
  FALSE,
  TRUE,
  1440,
  120,
  20,
  TRUE,
  FALSE,
  TRUE,
  TRUE,
  'final',
  9000,
  1,
  2500,
  1.0000,
  18,
  78,
  8000,
  0.7,
  11,
  FALSE,
  '[{"code":"small","name":"Kecil","description":"Dokumen atau paket kecil","max_weight_kg":5,"price_delta_idr":0,"multiplier":1},{"code":"medium","name":"Sedang","description":"Dus sedang","max_weight_kg":10,"price_delta_idr":2500,"multiplier":1.05},{"code":"large","name":"Besar","description":"Paket besar ringan","max_weight_kg":20,"price_delta_idr":6000,"multiplier":1.12}]',
  '{"volumetric_divisor":6000,"surcharge_threshold_kg":20,"surcharge_per_kg_idr":2000}',
  '{"sla":"regular","workflow":["pickup","inbound_origin","outbound_origin","inbound_destination","outbound_destination","delivery","pod"]}',
  '{"ui_badge":"REG"}'
),
(
  'tembus_yes',
  'TEMBUS YES',
  'Service express network parcel dengan prioritas SLA dan alur hub-and-spoke penuh.',
  'express',
  'network',
  'hub_and_spoke',
  TRUE,
  70,
  ARRAY['motor'],
  FALSE,
  FALSE,
  720,
  120,
  20,
  TRUE,
  FALSE,
  TRUE,
  TRUE,
  'final',
  15000,
  1,
  3500,
  1.2500,
  20,
  76,
  10000,
  0.7,
  11,
  FALSE,
  '[{"code":"small","name":"Kecil","description":"Dokumen atau paket kecil","max_weight_kg":5,"price_delta_idr":0,"multiplier":1},{"code":"medium","name":"Sedang","description":"Dus sedang","max_weight_kg":10,"price_delta_idr":3500,"multiplier":1.08},{"code":"large","name":"Besar","description":"Paket besar ringan","max_weight_kg":20,"price_delta_idr":8000,"multiplier":1.16}]',
  '{"volumetric_divisor":6000,"surcharge_threshold_kg":20,"surcharge_per_kg_idr":2500}',
  '{"sla":"express","workflow":["pickup","inbound_origin","outbound_origin","inbound_destination","outbound_destination","delivery","pod"]}',
  '{"ui_badge":"YES"}'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  service_family = EXCLUDED.service_family,
  service_category = EXCLUDED.service_category,
  route_model = EXCLUDED.route_model,
  display_order = EXCLUDED.display_order,
  vehicle_types = EXCLUDED.vehicle_types,
  exclusive_driver = EXCLUDED.exclusive_driver,
  batching_allowed = EXCLUDED.batching_allowed,
  max_eta_minutes = EXCLUDED.max_eta_minutes,
  max_distance_km = EXCLUDED.max_distance_km,
  max_weight_kg = EXCLUDED.max_weight_kg,
  uses_size_tier = EXCLUDED.uses_size_tier,
  requires_dimension_scan = EXCLUDED.requires_dimension_scan,
  allows_manual_dimension = EXCLUDED.allows_manual_dimension,
  requires_pickup_verification = EXCLUDED.requires_pickup_verification,
  price_mode = EXCLUDED.price_mode,
  base_fare_idr = EXCLUDED.base_fare_idr,
  included_distance_km = EXCLUDED.included_distance_km,
  per_km_idr = EXCLUDED.per_km_idr,
  service_multiplier = EXCLUDED.service_multiplier,
  platform_commission_percent = EXCLUDED.platform_commission_percent,
  courier_payout_percent = EXCLUDED.courier_payout_percent,
  courier_min_payout_idr = EXCLUDED.courier_min_payout_idr,
  mdr_percent = EXCLUDED.mdr_percent,
  ppn_percent = EXCLUDED.ppn_percent,
  show_customer_price_to_courier = EXCLUDED.show_customer_price_to_courier,
  size_tiers = EXCLUDED.size_tiers,
  dimension_rules = EXCLUDED.dimension_rules,
  availability_rules = EXCLUDED.availability_rules,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- +goose Down
DELETE FROM delivery_service_products WHERE code IN ('tembus_reg', 'tembus_yes');

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_model_check,
  ADD CONSTRAINT orders_model_check
    CHECK (model IN ('p2p', 'two_legs', 'three_legs'));

ALTER TABLE delivery_service_products
  DROP CONSTRAINT IF EXISTS delivery_service_products_route_model_check,
  ADD CONSTRAINT delivery_service_products_route_model_check
    CHECK (route_model IN ('p2p', 'two_legs', 'three_legs'));

ALTER TABLE delivery_service_products
  ALTER COLUMN service_family SET DEFAULT 'p2p';

ALTER TABLE delivery_service_products
  DROP COLUMN IF EXISTS service_category;
