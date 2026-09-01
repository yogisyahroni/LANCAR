-- +goose Up
-- ============================================================================
-- Seed data staging untuk UAT (LANCAR/TEMBUS) — idempoten (safe to re-run).
-- Dibuat 2026-08-13 pasca-fix blocker infra + BUG-009.
-- TIDAK mengubah apa pun di .env / API key eksternal.
-- ============================================================================

-- 1) Drop constraint lawas orders_model_check yang hanya mengizinkan
--    p2p/two_legs/three_legs/hub_and_spoke. Model baru (tembus_instant, dll)
--    gagal INSERT karena check ini. Constraint obsolete → di-drop.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_model_check;

-- 2) feature_flags untuk tiap model layanan (enable supaya create order lolos
--    validasi feature-flag di order-service).
INSERT INTO feature_flags (key, is_enabled, description, category) VALUES
  ('tembus_instant', TRUE, 'Instant delivery', 'delivery_model'),
  ('tembus_reg',      TRUE, 'Regular delivery', 'delivery_model'),
  ('tembus_mobil',    TRUE, 'Car delivery', 'delivery_model'),
  ('tembus_hemat',    TRUE, 'Hemat delivery', 'delivery_model'),
  ('tembus_priority', TRUE, 'Priority delivery', 'delivery_model'),
  ('tembus_same_day', TRUE, 'Same day delivery', 'delivery_model'),
  ('tambal_ban_motor', TRUE, 'Tambal ban motor', 'roadside'),
  ('tambal_ban_mobil', TRUE, 'Tambal ban mobil', 'roadside'),
  ('towing_motor',     TRUE, 'Towing motor', 'roadside'),
  ('towing_mobil',     TRUE, 'Towing mobil', 'roadside'),
  ('food_delivery',    TRUE, 'Food delivery', 'food'),
  ('on_demand',        TRUE, 'On demand', 'delivery_model')
ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled;

-- 3) Courier seed untuk nearby-couriers (tambal_ban / towing).
--    Insert dulu user dummy (idempoten) supaya FK user_id terpenuhi di
--    fresh DB (CI migration test), lalu insert/update courier_profiles.
INSERT INTO users (id, phone_number, full_name, role, status) VALUES
  ('00000000-0000-0000-0000-000000000001', '000000000001', 'UAT Courier Seed', 'courier', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO courier_profiles (
  id, user_id, vehicle_type, current_lat, current_lng,
  is_online, status, allows_tambal_ban, allows_towing,
  service_categories, avg_rating, radius_max_km
) VALUES (
  '451aba68-2de3-4883-b2fc-61bff58a4921',
  '00000000-0000-0000-0000-000000000001',
  'matic', -6.2146, 106.8451,
  TRUE, 'approved', TRUE, TRUE,
  ARRAY['on_demand','tambal_ban_motor','towing_motor'], 0, 10
)
ON CONFLICT (id) DO UPDATE SET
  is_online           = TRUE,
  status = 'approved',
  allows_tambal_ban   = TRUE,
  allows_towing       = TRUE,
  current_lat         = -6.2146,
  current_lng         = 106.8451,
  service_categories  = ARRAY['on_demand','tambal_ban_motor','towing_motor'],
  radius_max_km       = 10;

-- 4) Service price per courier (tambal_ban_motor / towing_motor) supaya
--    nearby-couriers return harga.
INSERT INTO courier_service_prices (courier_id, service_code, price_amount, min_price, max_price, is_active) VALUES
  ('451aba68-2de3-4883-b2fc-61bff58a4921', 'tambal_ban_motor', 15000, 15000, 15000, TRUE),
  ('451aba68-2de3-4883-b2fc-61bff58a4921', 'towing_motor',     25000, 25000, 25000, TRUE)
ON CONFLICT (courier_id, service_code) DO UPDATE SET
  price_amount = EXCLUDED.price_amount,
  is_active    = EXCLUDED.is_active;

-- 5) Voucher aktif untuk /vouchers/validate (TEMBUSHEMAT).
INSERT INTO vouchers (
  code, name, type, value, max_discount_idr, min_order_idr,
  quota, used_count, is_active, is_single_use, applicable_models,
  valid_from, valid_until
) VALUES (
  'TEMBUSHEMAT', 'Hemat 10rb', 'fixed', 10000, 10000, 0,
  100, 0, TRUE, FALSE,
  ARRAY['on_demand','tembus_instant','tembus_mobil','tambal_ban_motor','towing_motor'],
  '2026-08-01', '2026-12-31'
)
ON CONFLICT (code) DO UPDATE SET
  is_active = TRUE,
  value     = EXCLUDED.value,
  name      = EXCLUDED.name;

-- +goose Down
-- Rollback: non-destructive — matikan flag & voucher, kembalikan courier offline.
UPDATE feature_flags SET is_enabled = FALSE
  WHERE key IN ('tembus_instant','tembus_reg','tembus_mobil','tembus_hemat',
                'tembus_priority','tembus_same_day','tambal_ban_motor','tambal_ban_mobil',
                'towing_motor','towing_mobil','food_delivery','on_demand');
UPDATE vouchers SET is_active = FALSE WHERE code = 'TEMBUSHEMAT';
UPDATE courier_profiles SET is_online = FALSE WHERE id = '451aba68-2de3-4883-b2fc-61bff58a4921';
