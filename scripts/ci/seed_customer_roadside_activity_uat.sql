-- Customer roadside UAT fixture
--
-- Purpose: create two server-backed, active customer orders for the same
-- customer so Activity, order detail, courier profile, tracking, notes and
-- roadside reports can be verified together:
--   1) Tambal Ban motor accepted by Andri Pratama
--   2) Towing motor accepted by Bima Saputra
--
-- This is intentionally a UAT/staging fixture, not a production migration.
-- It is deterministic and safe to rerun: the two order numbers and IDs are
-- stable, reports/events are replaced for those fixture orders only.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = 'f567a612-8272-4c04-b42b-8f1f80817018'
  ) THEN
    RAISE EXCEPTION 'Expected UAT customer f567a612-8272-4c04-b42b-8f1f80817018 is missing';
  END IF;
END $$;

-- Dedicated towing UAT identity. The existing Andri Pratama seed is retained
-- for Tambal Ban so the two customer cards show different real profiles.
INSERT INTO users (id, phone_number, email, full_name, photo_url, role, status, is_verified)
VALUES (
  'a3d2c4e6-5b78-4c01-9d23-7ef012345678',
  '6281299998888',
  'uat.towing.bima@tembus.id',
  'Bima Saputra',
  NULL,
  'courier',
  'active',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  is_verified = EXCLUDED.is_verified,
  updated_at = NOW();

INSERT INTO courier_profiles (
  id, user_id, vehicle_type, vehicle_type_car, vehicle_brand, vehicle_model,
  vehicle_plate, vehicle_category, vehicle_year, vehicle_cc, verification_status,
  is_verified, verified_at, is_online, status, onboarding_status, tier,
  service_categories, allows_tambal_ban, allows_towing, current_location,
  current_lat, current_lng, last_location_at, radius_max_km, relay_score,
  avg_rating, rating_count, acceptance_rate_pct, completion_rate_pct,
  ontime_rate_pct, onboarding_checklist, last_active_at, updated_at
)
VALUES (
  'b3f4d5e6-7a89-4c12-8d34-9f0123456789',
  'a3d2c4e6-5b78-4c01-9d23-7ef012345678',
  'matic',
  NULL,
  'Honda',
  'Vario 160',
  'B 2002 TBS',
  'motor',
  2024,
  160,
  'approved',
  TRUE,
  NOW(),
  TRUE,
  'online',
  'ACTIVE',
  'gold',
  ARRAY['on_demand', 'towing_motor']::text[],
  FALSE,
  TRUE,
  ST_SetSRID(ST_MakePoint(106.8325, -6.2185), 4326)::geography,
  -6.2185,
  106.8325,
  NOW(),
  20,
  4.80,
  4.90,
  28,
  98,
  97,
  96,
  '{"identity":true,"vehicle":true,"bank":true,"passed":true,"policy_version":"courier-profile-v1"}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  vehicle_type = EXCLUDED.vehicle_type,
  vehicle_type_car = EXCLUDED.vehicle_type_car,
  vehicle_brand = EXCLUDED.vehicle_brand,
  vehicle_model = EXCLUDED.vehicle_model,
  vehicle_plate = EXCLUDED.vehicle_plate,
  vehicle_category = EXCLUDED.vehicle_category,
  vehicle_year = EXCLUDED.vehicle_year,
  vehicle_cc = EXCLUDED.vehicle_cc,
  verification_status = EXCLUDED.verification_status,
  is_verified = EXCLUDED.is_verified,
  verified_at = EXCLUDED.verified_at,
  is_online = EXCLUDED.is_online,
  status = EXCLUDED.status,
  onboarding_status = EXCLUDED.onboarding_status,
  tier = EXCLUDED.tier,
  service_categories = EXCLUDED.service_categories,
  allows_tambal_ban = EXCLUDED.allows_tambal_ban,
  allows_towing = EXCLUDED.allows_towing,
  current_location = EXCLUDED.current_location,
  current_lat = EXCLUDED.current_lat,
  current_lng = EXCLUDED.current_lng,
  last_location_at = EXCLUDED.last_location_at,
  radius_max_km = EXCLUDED.radius_max_km,
  relay_score = EXCLUDED.relay_score,
  avg_rating = EXCLUDED.avg_rating,
  rating_count = EXCLUDED.rating_count,
  acceptance_rate_pct = EXCLUDED.acceptance_rate_pct,
  completion_rate_pct = EXCLUDED.completion_rate_pct,
  ontime_rate_pct = EXCLUDED.ontime_rate_pct,
  onboarding_checklist = EXCLUDED.onboarding_checklist,
  last_active_at = EXCLUDED.last_active_at,
  updated_at = NOW();

INSERT INTO courier_service_prices (id, courier_id, service_code, price_amount, min_price, max_price, is_active)
VALUES (
  'c4e5f6a7-8b90-4c23-9d45-a01234567890',
  'b3f4d5e6-7a89-4c12-8d34-9f0123456789',
  'towing_motor',
  35000,
  35000,
  35000,
  TRUE
)
ON CONFLICT (courier_id, service_code) DO UPDATE SET
  price_amount = EXCLUDED.price_amount,
  min_price = EXCLUDED.min_price,
  max_price = EXCLUDED.max_price,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Remove only the fixture's replaceable projections before recreating them.
DELETE FROM order_events
WHERE order_id IN (
  'a1b2c3d4-1111-4aaa-8aaa-111111111111',
  'a1b2c3d4-2222-4aaa-8aaa-222222222222'
);
DELETE FROM tambal_ban_reports
WHERE order_id = 'a1b2c3d4-1111-4aaa-8aaa-111111111111';
DELETE FROM towing_reports
WHERE order_id = 'a1b2c3d4-2222-4aaa-8aaa-222222222222';

-- Tambal Ban: a recent accepted order with a customer-visible service note.
INSERT INTO orders (
  id, order_number, customer_id, model, status,
  pickup_location, pickup_address, pickup_notes,
  dropoff_location, dropoff_address, dropoff_notes,
  recipient_name, recipient_phone_masked, distance_km,
  base_price_idr, total_price_idr, ppn_idr, mdr_idr,
  base_price_minor, total_price_minor, dpp_minor, ppn_minor,
  distance_fee_minor, volumetric_surcharge_minor, dynamic_price_minor,
  discount_minor, insurance_premium_minor, platform_fee_minor, promo_subsidy_minor,
  customer_notes, order_notes, schedule_type,
  service_code, service_sub_type, service_category, service_snapshot,
  courier_service_price, per_km_rate_applied, base_fee_applied, toll_cost,
  vehicle_type_target, vehicle_condition_notes, tire_damage_type,
  service_duration_minutes, service_notes, preferred_courier_id,
  contract_version, state_version, correlation_id, service_metadata,
  route_snapshot, created_at, updated_at
)
VALUES (
  'a1b2c3d4-1111-4aaa-8aaa-111111111111',
  'UAT-TAMBAL-CUSTOMER-01',
  'f567a612-8272-4c04-b42b-8f1f80817018',
  'p2p',
  'accepted',
  ST_SetSRID(ST_MakePoint(106.827153, -6.214621), 4326)::geography,
  'Jl. Prof. DR. Satrio No. 5, Karet, Jakarta Selatan',
  'Motor berhenti di bahu jalan dekat minimarket.',
  ST_SetSRID(ST_MakePoint(106.838905, -6.229728), 4326)::geography,
  'Bengkel Mitra TEMBUS, Jl. Rasuna Said No. 7, Jakarta Selatan',
  'Bengkel tujuan untuk pemeriksaan lanjutan.',
  'Pemilik Kendaraan',
  '62812******55',
  2.4,
  15000,
  15000,
  0,
  0,
  15000,
  15000,
  15000,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  'Ban belakang bocor setelah terkena paku. Mohon petugas mengonfirmasi kendaraan sebelum mulai.',
  'Ban belakang bocor setelah terkena paku. Mohon petugas mengonfirmasi kendaraan sebelum mulai.',
  'now',
  'tambal_ban_motor',
  'tambal_ban_motor',
  'tambal_ban',
  '{"service":"tambal_ban","vehicle_type":"motor","price_idr":15000,"provider":"TEMBUS Roadside"}'::jsonb,
  15000,
  0,
  15000,
  0,
  'motor',
  'Honda Beat hitam, ban belakang kempis total; kendaraan tetap aman di standar tengah.',
  'puncture',
  30,
  'Petugas membawa patch kit dan pompa portable.',
  'd8180681-082f-4fa0-ba37-807b7262afc1',
  '2026-09-01',
  1,
  'a1b2c3d4-1111-4aaa-8aaa-111111111112',
  '{"uat_fixture":"customer_roadside_dual_request_v1","scenario":"tambal_ban","customer_visible_note":"Ban belakang bocor setelah terkena paku. Mohon petugas mengonfirmasi kendaraan sebelum mulai.","vehicle":{"type":"motor","brand":"Honda","model":"Beat","plate":"B 1234 TBS"},"verification":{"required":true,"vehicle_match":"Honda Beat hitam"}}'::jsonb,
  '{"provider":"tembus","distance_meters":2400,"duration_seconds":720,"eta_minutes":12}'::jsonb,
  NOW() - INTERVAL '90 seconds',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  pickup_location = EXCLUDED.pickup_location,
  pickup_address = EXCLUDED.pickup_address,
  pickup_notes = EXCLUDED.pickup_notes,
  dropoff_location = EXCLUDED.dropoff_location,
  dropoff_address = EXCLUDED.dropoff_address,
  dropoff_notes = EXCLUDED.dropoff_notes,
  customer_notes = EXCLUDED.customer_notes,
  order_notes = EXCLUDED.order_notes,
  service_code = EXCLUDED.service_code,
  service_sub_type = EXCLUDED.service_sub_type,
  service_category = EXCLUDED.service_category,
  service_snapshot = EXCLUDED.service_snapshot,
  courier_service_price = EXCLUDED.courier_service_price,
  vehicle_type_target = EXCLUDED.vehicle_type_target,
  vehicle_condition_notes = EXCLUDED.vehicle_condition_notes,
  tire_damage_type = EXCLUDED.tire_damage_type,
  service_duration_minutes = EXCLUDED.service_duration_minutes,
  service_notes = EXCLUDED.service_notes,
  preferred_courier_id = EXCLUDED.preferred_courier_id,
  state_version = EXCLUDED.state_version,
  correlation_id = EXCLUDED.correlation_id,
  service_metadata = EXCLUDED.service_metadata,
  route_snapshot = EXCLUDED.route_snapshot,
  updated_at = NOW();

-- Towing: separate profile, route and customer-visible note.
INSERT INTO orders (
  id, order_number, customer_id, model, status,
  pickup_location, pickup_address, pickup_notes,
  dropoff_location, dropoff_address, dropoff_notes,
  recipient_name, recipient_phone_masked, distance_km,
  base_price_idr, total_price_idr, ppn_idr, mdr_idr,
  base_price_minor, total_price_minor, dpp_minor, ppn_minor,
  distance_fee_minor, volumetric_surcharge_minor, dynamic_price_minor,
  discount_minor, insurance_premium_minor, platform_fee_minor, promo_subsidy_minor,
  customer_notes, order_notes, schedule_type,
  service_code, service_sub_type, service_category, service_snapshot,
  courier_service_price, per_km_rate_applied, base_fee_applied, toll_cost,
  vehicle_type_target, vehicle_condition_notes, service_duration_minutes,
  service_notes, preferred_courier_id,
  contract_version, state_version, correlation_id, service_metadata,
  route_snapshot, created_at, updated_at
)
VALUES (
  'a1b2c3d4-2222-4aaa-8aaa-222222222222',
  'UAT-TOWING-CUSTOMER-01',
  'f567a612-8272-4c04-b42b-8f1f80817018',
  'p2p',
  'accepted',
  ST_SetSRID(ST_MakePoint(106.845130, -6.208763), 4326)::geography,
  'Jl. Gatot Subroto Kav. 10, Kuningan, Jakarta Selatan',
  'Mobil mogok di bahu jalan. Area aman dan lampu hazard menyala.',
  ST_SetSRID(ST_MakePoint(106.801500, -6.261500), 4326)::geography,
  'Bengkel Towing Partner TEMBUS, Jl. Kemang Raya No. 18, Jakarta Selatan',
  'Tujuan drop-off sudah dikonfirmasi customer.',
  'Pemilik Kendaraan',
  '62812******55',
  7.8,
  35000,
  35000,
  0,
  0,
  35000,
  35000,
  35000,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  'Mobil mogok setelah mesin mati mendadak. Mohon petugas cek kendaraan sebelum pemasangan towing.',
  'Mobil mogok setelah mesin mati mendadak. Mohon petugas cek kendaraan sebelum pemasangan towing.',
  'now',
  'towing_motor',
  'towing_motor',
  'towing',
  '{"service":"towing","vehicle_type":"motor","price_idr":35000,"provider":"TEMBUS Roadside"}'::jsonb,
  35000,
  0,
  35000,
  0,
  'motor',
  'Unit perlu dipindahkan menggunakan towing; roda depan terkunci dan setir tidak stabil.',
  45,
  'Pastikan kendaraan sesuai foto dan catat kondisi sebelum pengangkatan.',
  'a3d2c4e6-5b78-4c01-9d23-7ef012345678',
  '2026-09-01',
  1,
  'a1b2c3d4-2222-4aaa-8aaa-222222222223',
  '{"uat_fixture":"customer_roadside_dual_request_v1","scenario":"towing","customer_visible_note":"Mobil mogok setelah mesin mati mendadak. Mohon petugas cek kendaraan sebelum pemasangan towing.","vehicle":{"type":"motor","brand":"Honda","model":"Vario 160","plate":"B 5678 TBS"},"verification":{"required":true,"vehicle_match":"Honda Vario 160 merah"}}'::jsonb,
  '{"provider":"tembus","distance_meters":7800,"duration_seconds":1500,"eta_minutes":25}'::jsonb,
  NOW() - INTERVAL '60 seconds',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  pickup_location = EXCLUDED.pickup_location,
  pickup_address = EXCLUDED.pickup_address,
  pickup_notes = EXCLUDED.pickup_notes,
  dropoff_location = EXCLUDED.dropoff_location,
  dropoff_address = EXCLUDED.dropoff_address,
  dropoff_notes = EXCLUDED.dropoff_notes,
  customer_notes = EXCLUDED.customer_notes,
  order_notes = EXCLUDED.order_notes,
  service_code = EXCLUDED.service_code,
  service_sub_type = EXCLUDED.service_sub_type,
  service_category = EXCLUDED.service_category,
  service_snapshot = EXCLUDED.service_snapshot,
  courier_service_price = EXCLUDED.courier_service_price,
  vehicle_type_target = EXCLUDED.vehicle_type_target,
  vehicle_condition_notes = EXCLUDED.vehicle_condition_notes,
  service_duration_minutes = EXCLUDED.service_duration_minutes,
  service_notes = EXCLUDED.service_notes,
  preferred_courier_id = EXCLUDED.preferred_courier_id,
  state_version = EXCLUDED.state_version,
  correlation_id = EXCLUDED.correlation_id,
  service_metadata = EXCLUDED.service_metadata,
  route_snapshot = EXCLUDED.route_snapshot,
  updated_at = NOW();

-- Mark the two deterministic UAT requests as paid through the local bypassed
-- provider so customer Activity/detail can exercise the normal paid state
-- without requiring an external payment gateway.
INSERT INTO payments (
  id, order_id, payment_number, provider, method, status, purpose,
  currency_code, currency_minor_unit, amount_minor, mdr_amount_minor,
  ppn_amount_minor, weather_reserve_minor, insurance_reserve_minor,
  net_operational_minor, amount_idr, mdr_amount_idr, ppn_amount_idr,
  weather_reserve_idr, insurance_reserve_idr, net_operational_idr,
  provider_reference, webhook_payload, expires_at, paid_at,
  provider_verified_at, created_at, updated_at
)
VALUES
(
  'a1b2c3d4-6111-4aaa-8aaa-611111111111',
  'a1b2c3d4-1111-4aaa-8aaa-111111111111',
  'UAT-PAY-TAMBAL-01', 'bypassed', 'bypassed', 'paid', 'order',
  'IDR', 0, 15000, 0, 0, 0, 0, 15000,
  15000, 0, 0, 0, 0, 15000,
  'UAT-TX-TAMBAL-01',
  jsonb_build_object(
    'order_id', 'UAT-PAY-TAMBAL-01',
    'transaction_id', 'UAT-TX-TAMBAL-01',
    'status_code', '200',
    'transaction_status', 'settlement',
    'fraud_status', 'accept',
    'gross_amount', '15000'
  ),
  NOW() + INTERVAL '1 day', NOW(), NOW(), NOW(), NOW()
),
(
  'a1b2c3d4-6222-4aaa-8aaa-622222222222',
  'a1b2c3d4-2222-4aaa-8aaa-222222222222',
  'UAT-PAY-TOWING-01', 'bypassed', 'bypassed', 'paid', 'order',
  'IDR', 0, 35000, 0, 0, 0, 0, 35000,
  35000, 0, 0, 0, 0, 35000,
  'UAT-TX-TOWING-01',
  jsonb_build_object(
    'order_id', 'UAT-PAY-TOWING-01',
    'transaction_id', 'UAT-TX-TOWING-01',
    'status_code', '200',
    'transaction_status', 'settlement',
    'fraud_status', 'accept',
    'gross_amount', '35000'
  ),
  NOW() + INTERVAL '1 day', NOW(), NOW(), NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- Both active legs point to users.id. Reports point to courier_profiles.id.
INSERT INTO order_legs (
  id, order_id, leg_number, courier_id, status,
  pickup_location, dropoff_location, assigned_fee_idr,
  assigned_at, courier_earning_policy_snapshot, courier_earning_components,
  created_at, updated_at
)
VALUES
(
  'a1b2c3d4-3111-4aaa-8aaa-311111111111',
  'a1b2c3d4-1111-4aaa-8aaa-111111111111',
  1,
  'd8180681-082f-4fa0-ba37-807b7262afc1',
  'accepted',
  ST_SetSRID(ST_MakePoint(106.827153, -6.214621), 4326)::geography,
  ST_SetSRID(ST_MakePoint(106.838905, -6.229728), 4326)::geography,
  15000,
  NOW() - INTERVAL '45 seconds',
  '{"source":"uat_fixture","service":"tambal_ban_motor"}'::jsonb,
  '{"base_fee_idr":15000,"service_price_idr":15000}'::jsonb,
  NOW() - INTERVAL '90 seconds',
  NOW()
)
ON CONFLICT (order_id, leg_number) DO UPDATE SET
  courier_id = EXCLUDED.courier_id,
  status = EXCLUDED.status,
  pickup_location = EXCLUDED.pickup_location,
  dropoff_location = EXCLUDED.dropoff_location,
  assigned_fee_idr = EXCLUDED.assigned_fee_idr,
  assigned_at = EXCLUDED.assigned_at,
  updated_at = NOW();

INSERT INTO order_legs (
  id, order_id, leg_number, courier_id, status,
  pickup_location, dropoff_location, assigned_fee_idr,
  assigned_at, courier_earning_policy_snapshot, courier_earning_components,
  created_at, updated_at
)
VALUES (
  'a1b2c3d4-3222-4aaa-8aaa-322222222222',
  'a1b2c3d4-2222-4aaa-8aaa-222222222222',
  1,
  'a3d2c4e6-5b78-4c01-9d23-7ef012345678',
  'accepted',
  ST_SetSRID(ST_MakePoint(106.845130, -6.208763), 4326)::geography,
  ST_SetSRID(ST_MakePoint(106.801500, -6.261500), 4326)::geography,
  35000,
  NOW() - INTERVAL '30 seconds',
  '{"source":"uat_fixture","service":"towing_motor"}'::jsonb,
  '{"base_fee_idr":35000,"service_price_idr":35000}'::jsonb,
  NOW() - INTERVAL '60 seconds',
  NOW()
)
ON CONFLICT (order_id, leg_number) DO UPDATE SET
  courier_id = EXCLUDED.courier_id,
  status = EXCLUDED.status,
  pickup_location = EXCLUDED.pickup_location,
  dropoff_location = EXCLUDED.dropoff_location,
  assigned_fee_idr = EXCLUDED.assigned_fee_idr,
  assigned_at = EXCLUDED.assigned_at,
  updated_at = NOW();

-- Final service reports are intentionally absent: both requests are active.
-- The customer-visible pre-service condition and notes live in orders.service_metadata,
-- while the courier writes immutable photo/report rows only after the service
-- proof is complete.

INSERT INTO order_events (
  id, order_id, user_id, event_type, description, metadata,
  actor_id, actor_role, from_status, to_status, idempotency_key, created_at
)
VALUES
(
  'a1b2c3d4-5111-4aaa-8aaa-511111111111',
  'a1b2c3d4-1111-4aaa-8aaa-111111111111',
  'f567a612-8272-4c04-b42b-8f1f80817018',
  'roadside_request.created',
  'Permintaan Tambal Ban diterima dan sedang menuju lokasi.',
  '{"source":"uat_fixture","service":"tambal_ban","customer_note":true}'::jsonb,
  'd8180681-082f-4fa0-ba37-807b7262afc1',
  'courier',
  'searching',
  'accepted',
  'uat-roadside-tire-accepted-v1',
  NOW() - INTERVAL '45 seconds'
),
(
  'a1b2c3d4-5222-4aaa-8aaa-522222222222',
  'a1b2c3d4-2222-4aaa-8aaa-222222222222',
  'f567a612-8272-4c04-b42b-8f1f80817018',
  'roadside_request.created',
  'Permintaan Towing diterima dan petugas sedang menuju titik penjemputan.',
  '{"source":"uat_fixture","service":"towing","customer_note":true}'::jsonb,
  'a3d2c4e6-5b78-4c01-9d23-7ef012345678',
  'courier',
  'searching',
  'accepted',
  'uat-roadside-towing-accepted-v1',
  NOW() - INTERVAL '30 seconds'
);

INSERT INTO courier_availability_state (
  courier_id, current_state, active_order_id, active_order_type,
  latitude, longitude, last_location_update, presence_state,
  presence_reason, heartbeat_at, updated_at
)
VALUES
(
  '451aba68-2de3-4883-b2fc-61bff58a4921', 'navigating_to_pickup',
  'a1b2c3d4-1111-4aaa-8aaa-111111111111', 'tambal_ban_motor',
  -6.2155, 106.8290, NOW(), 'online', 'uat_customer_roadside_activity', NOW(), NOW()
),
(
  'b3f4d5e6-7a89-4c12-8d34-9f0123456789', 'navigating_to_pickup',
  'a1b2c3d4-2222-4aaa-8aaa-222222222222', 'towing_motor',
  -6.2100, 106.8390, NOW(), 'online', 'uat_customer_roadside_activity', NOW(), NOW()
)
ON CONFLICT (courier_id) DO UPDATE SET
  current_state = EXCLUDED.current_state,
  active_order_id = EXCLUDED.active_order_id,
  active_order_type = EXCLUDED.active_order_type,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  last_location_update = EXCLUDED.last_location_update,
  presence_state = EXCLUDED.presence_state,
  presence_reason = EXCLUDED.presence_reason,
  heartbeat_at = EXCLUDED.heartbeat_at,
  updated_at = NOW();

COMMIT;

-- Verification query (safe to run after the transaction):
-- SELECT o.order_number, o.status, o.service_category, o.service_sub_type,
--        o.order_notes, u.full_name AS courier, cp.vehicle_plate,
--        cp.vehicle_brand, cp.vehicle_model, ol.status AS leg_status
-- FROM orders o
-- JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
-- JOIN users u ON u.id = ol.courier_id
-- LEFT JOIN courier_profiles cp ON cp.user_id = u.id
-- WHERE o.id IN ('a1b2c3d4-1111-4aaa-8aaa-111111111111',
--                'a1b2c3d4-2222-4aaa-8aaa-222222222222')
-- ORDER BY o.created_at DESC;
