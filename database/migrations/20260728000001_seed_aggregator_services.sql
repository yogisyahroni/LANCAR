-- +goose Up
-- +goose StatementBegin
-- Seed aggregator delivery service product for 3PL/network parcel flow.
-- Runs alongside existing on_demand services (tembus_priority, tembus_instant, etc.)
-- without removing or altering them.

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
  'tembus_aggregator',
  'TEMBUS Aggregator',
  'Kirim paket dengan jaringan 3PL nasional (JNE, J&T, SiCepat, AnterAja). Cek ongkir dari semua provider dan pilih yang termurah atau tercepat.',
  'aggregator',
  'aggregator',
  'hub_and_spoke',
  TRUE,
  80,
  ARRAY['motor', 'car'],
  FALSE,
  FALSE,
  4320,
  999,
  50,
  TRUE,
  FALSE,
  TRUE,
  FALSE,
  'quote',
  0,
  0,
  0,
  1.0000,
  15,
  0,
  0,
  0.7,
  11,
  FALSE,
  '[{"code":"small","name":"Kecil","description":"Paket ringan < 3kg","max_weight_kg":3,"price_delta_idr":0,"multiplier":1},{"code":"medium","name":"Sedang","description":"Paket 3-10kg","max_weight_kg":10,"price_delta_idr":0,"multiplier":1},{"code":"large","name":"Besar","description":"Paket 10-50kg","max_weight_kg":50,"price_delta_idr":0,"multiplier":1}]',
  '{}',
  '{"sla":"aggregator","workflow":["pickup","hub","delivery"]}',
  '{"ui_badge":"AGG","provider_required":true}'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  service_family = EXCLUDED.service_family,
  service_category = EXCLUDED.service_category,
  route_model = EXCLUDED.route_model,
  display_order = EXCLUDED.display_order,
  is_enabled = EXCLUDED.is_enabled,
  vehicle_types = EXCLUDED.vehicle_types,
  max_eta_minutes = EXCLUDED.max_eta_minutes,
  max_weight_kg = EXCLUDED.max_weight_kg,
  uses_size_tier = EXCLUDED.uses_size_tier,
  allows_manual_dimension = EXCLUDED.allows_manual_dimension,
  requires_pickup_verification = EXCLUDED.requires_pickup_verification,
  price_mode = EXCLUDED.price_mode,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM delivery_service_products WHERE code = 'tembus_aggregator';
-- +goose StatementEnd