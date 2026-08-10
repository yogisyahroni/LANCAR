-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-050 (keputusan arsitektur poin/bonus)
-- Rekomendasi: reuse tabel existing, JANGAN bikin tabel baru.
--   (a) courier_incentive_campaigns  = wadah campaign mingguan
--       (contoh: FOODBIKE_W1 seed di bawah)
--   (b) courier_tier_configs         = reliability score bike
--       -> tambah kolom transport_mode ('all' default), seed tier bike
--   Poin harian (driver_daily_points/bonus_payout, FOOD-BIKE-027)
--       tetap sistem utama akumulasi -> payout mingguan (sudah ter-wire
--       lewat AddPoints di transisi delivered).
-- ============================================================

ALTER TABLE courier_tier_configs
  ADD COLUMN IF NOT EXISTS transport_mode VARCHAR(20) NOT NULL DEFAULT 'all';

-- Tier khusus kurir sepeda (reliability bike) — threshold lebih longgar
-- karena kapasitas delivery/hari lebih rendah dari motor.
INSERT INTO courier_tier_configs (
  tier_code, tier_name, min_rating, min_completion_rate, min_deliveries_30d,
  benefit_summary, display_order, transport_mode
) VALUES
  ('bike_reliable', 'Bike Reliable', 4.50, 90, 20,
   'Prioritas dispatch food-bike lebih tinggi dan akses campaign mingguan.', 21, 'bike'),
  ('bike_elite', 'Bike Elite', 4.75, 95, 50,
   'Prioritas dispatch food-bike tertinggi, campaign premium.', 31, 'bike')
ON CONFLICT (tier_code) DO UPDATE SET
  tier_name = EXCLUDED.tier_name,
  min_rating = EXCLUDED.min_rating,
  min_completion_rate = EXCLUDED.min_completion_rate,
  min_deliveries_30d = EXCLUDED.min_deliveries_30d,
  benefit_summary = EXCLUDED.benefit_summary,
  display_order = EXCLUDED.display_order,
  transport_mode = EXCLUDED.transport_mode;

-- Contoh campaign mingguan tutup-poin untuk food-bike (reuse tabel campaign,
-- bukan tabel baru). Operator cukup insert baris baru tiap minggu.
INSERT INTO courier_incentive_campaigns (
  code, title, description, target_deliveries, reward_idr, starts_at, ends_at
) VALUES (
  'FOODBIKE_W1',
  'Food Bike Challenge Minggu 1',
  'Selesaikan 15 order food delivery dalam seminggu dan dapatkan bonus Rp50.000.',
  15, 50000, NOW(), NOW() + INTERVAL '7 days'
)
ON CONFLICT (code) DO NOTHING;

-- +goose Down
DELETE FROM courier_incentive_campaigns WHERE code = 'FOODBIKE_W1';
DELETE FROM courier_tier_configs WHERE tier_code IN ('bike_reliable', 'bike_elite');
ALTER TABLE courier_tier_configs DROP COLUMN IF EXISTS transport_mode;
