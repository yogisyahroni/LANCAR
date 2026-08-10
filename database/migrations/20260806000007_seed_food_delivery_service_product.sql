-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-007 + FOOD-BIKE-033: Seed food_delivery
-- service product. Eksklusif kendaraan 'sepeda' (motor dilarang).
-- Kolom proof diset untuk pickup di merchant (FOOD-BIKE-033):
--   - proof_geofence_radius_m 15m (warung/merchant sempit)
--   - pod_label 'Bukti Terima Makanan'
--   - face_verification_required FALSE (driver sudah face-verified
--     saat aktivasi; pickup cukup scan struk + foto)
-- ============================================================

INSERT INTO delivery_service_products (
  code, name, description, service_family, service_category, route_model,
  is_enabled, display_order,
  vehicle_types, exclusive_driver, batching_allowed,
  max_eta_minutes, max_distance_km, max_weight_kg,
  uses_size_tier, requires_dimension_scan, allows_manual_dimension,
  requires_pickup_verification,
  price_mode, base_fare_idr, included_distance_km, per_km_idr, service_multiplier,
  platform_commission_percent, courier_payout_percent, courier_min_payout_idr,
  mdr_percent, ppn_percent, show_customer_price_to_courier,
  proof_geofence_radius_m, proof_min_accuracy_m, face_verification_required, pod_label,
  max_active_orders_regular, max_active_orders_on_demand,
  size_tiers, dimension_rules, availability_rules, metadata
) VALUES (
  'food_delivery',
  'Food Delivery',
  'Antar makanan dari merchant terdekat. Eksklusif kurir sepeda — motor tidak dapat mengambil order tipe ini.',
  'on_demand',
  'food_delivery',
  'p2p',
  TRUE,
  60,
  ARRAY['sepeda'],
  FALSE,
  FALSE,
  60,
  20,
  10,
  FALSE,
  FALSE,
  FALSE,
  TRUE,
  'final',
  5000,
  2,
  2500,
  1.0000,
  15,
  85,
  3500,
  0.7,
  11,
  FALSE,
  15,
  50,
  FALSE,
  'Bukti Terima Makanan',
  3,
  1,
  '[]'::jsonb,
  '{}'::jsonb,
  '{"sla":"food","workflow":["merchant_pickup","delivery"]}'::jsonb,
  '{"ui_badge":"FOOD","is_food":true}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  service_category = EXCLUDED.service_category,
  route_model = EXCLUDED.route_model,
  is_enabled = EXCLUDED.is_enabled,
  vehicle_types = EXCLUDED.vehicle_types,
  max_distance_km = EXCLUDED.max_distance_km,
  max_weight_kg = EXCLUDED.max_weight_kg,
  uses_size_tier = EXCLUDED.uses_size_tier,
  requires_dimension_scan = EXCLUDED.requires_dimension_scan,
  requires_pickup_verification = EXCLUDED.requires_pickup_verification,
  base_fare_idr = EXCLUDED.base_fare_idr,
  included_distance_km = EXCLUDED.included_distance_km,
  per_km_idr = EXCLUDED.per_km_idr,
  proof_geofence_radius_m = EXCLUDED.proof_geofence_radius_m,
  pod_label = EXCLUDED.pod_label,
  face_verification_required = EXCLUDED.face_verification_required,
  availability_rules = EXCLUDED.availability_rules,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- +goose Down
DELETE FROM delivery_service_products WHERE code = 'food_delivery';
