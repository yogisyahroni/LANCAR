-- +goose Up
-- ============================================================
-- Migration 00009: Schema Extension + Full Seed Data
-- TEMBUS Hyperlocal Delivery Platform
-- ============================================================

-- -------------------------------------------------------
-- 0a. Extend meeting_points (hanya ada kolom id di DB)
-- -------------------------------------------------------
ALTER TABLE meeting_points ADD COLUMN IF NOT EXISTS name       VARCHAR(255)            NOT NULL DEFAULT '';
ALTER TABLE meeting_points ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE meeting_points ADD COLUMN IF NOT EXISTS location   GEOGRAPHY(POINT, 4326);
ALTER TABLE meeting_points ADD COLUMN IF NOT EXISTS zone_id    UUID REFERENCES zones(id);
ALTER TABLE meeting_points ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT TRUE;
ALTER TABLE meeting_points ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE meeting_points ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE meeting_points ALTER COLUMN name DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_meeting_points_zone   ON meeting_points(zone_id);
CREATE INDEX IF NOT EXISTS idx_meeting_points_active ON meeting_points(is_active) WHERE is_active = TRUE;

-- -------------------------------------------------------
-- 0b. Extend pricing_configs (hanya ada kolom id di DB)
-- -------------------------------------------------------
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS model             VARCHAR(20)  NOT NULL DEFAULT '';
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS base_fee          INT          NOT NULL DEFAULT 0;
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS per_km_fee        INT          NOT NULL DEFAULT 0;
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS min_distance_km   DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS max_distance_km   DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS weight_limit_kg   DECIMAL(8,2);
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS is_active         BOOLEAN      DEFAULT TRUE;
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW();
ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW();

-- Remove temp DEFAULT '' on model
ALTER TABLE pricing_configs ALTER COLUMN model DROP DEFAULT;
ALTER TABLE pricing_configs ALTER COLUMN base_fee DROP DEFAULT;
ALTER TABLE pricing_configs ALTER COLUMN per_km_fee DROP DEFAULT;
ALTER TABLE pricing_configs ALTER COLUMN min_distance_km DROP DEFAULT;
ALTER TABLE pricing_configs ALTER COLUMN max_distance_km DROP DEFAULT;

-- -------------------------------------------------------
-- 0c. Extend feature_flags: tambahkan kolom name
-- -------------------------------------------------------
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- -------------------------------------------------------
-- 1. 5 Jakarta Zones dengan PostGIS polygon akurat
-- -------------------------------------------------------
INSERT INTO zones (name, code, polygon, center, is_active, max_couriers) VALUES
(
    'Jakarta Pusat', 'JKT-PST',
    ST_GeogFromText('POLYGON((106.7950 -6.1450, 106.8600 -6.1450, 106.8600 -6.2100, 106.7950 -6.2100, 106.7950 -6.1450))'),
    ST_GeogFromText('POINT(106.8275 -6.1775)'), TRUE, 120
),
(
    'Jakarta Selatan', 'JKT-SEL',
    ST_GeogFromText('POLYGON((106.7600 -6.2100, 106.8700 -6.2100, 106.8700 -6.3500, 106.7600 -6.3500, 106.7600 -6.2100))'),
    ST_GeogFromText('POINT(106.8150 -6.2800)'), TRUE, 150
),
(
    'Jakarta Barat', 'JKT-BAR',
    ST_GeogFromText('POLYGON((106.7000 -6.1200, 106.8000 -6.1200, 106.8000 -6.2500, 106.7000 -6.2500, 106.7000 -6.1200))'),
    ST_GeogFromText('POINT(106.7500 -6.1850)'), TRUE, 130
),
(
    'Jakarta Timur', 'JKT-TIM',
    ST_GeogFromText('POLYGON((106.8600 -6.1300, 106.9800 -6.1300, 106.9800 -6.3200, 106.8600 -6.3200, 106.8600 -6.1300))'),
    ST_GeogFromText('POINT(106.9200 -6.2250)'), TRUE, 140
),
(
    'Jakarta Utara', 'JKT-UTA',
    ST_GeogFromText('POLYGON((106.7400 -6.0500, 106.9200 -6.0500, 106.9200 -6.1600, 106.7400 -6.1600, 106.7400 -6.0500))'),
    ST_GeogFromText('POINT(106.8300 -6.1050)'), TRUE, 100
)
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------
-- 2. 10 Meeting Points strategis
-- -------------------------------------------------------
INSERT INTO meeting_points (name, address, location, zone_id, is_active) VALUES
('Hub Sudirman',      'Jl. Jend. Sudirman Kav. 1, Karet Tengsin, Jakarta Pusat',   ST_GeogFromText('POINT(106.8227 -6.2023)'), (SELECT id FROM zones WHERE code = 'JKT-PST'), TRUE),
('Hub Thamrin City',  'Jl. Thamrin No.1, Menteng, Jakarta Pusat',                  ST_GeogFromText('POINT(106.8200 -6.1866)'), (SELECT id FROM zones WHERE code = 'JKT-PST'), TRUE),
('Hub Blok M',        'Jl. Melawai Raya, Blok M, Jakarta Selatan',                 ST_GeogFromText('POINT(106.8015 -6.2444)'), (SELECT id FROM zones WHERE code = 'JKT-SEL'), TRUE),
('Hub TB Simatupang', 'Jl. TB Simatupang, Cilandak, Jakarta Selatan',              ST_GeogFromText('POINT(106.8140 -6.3024)'), (SELECT id FROM zones WHERE code = 'JKT-SEL'), TRUE),
('Hub Grogol',        'Jl. Prof. Dr. Latumenten, Grogol, Jakarta Barat',           ST_GeogFromText('POINT(106.7847 -6.1622)'), (SELECT id FROM zones WHERE code = 'JKT-BAR'), TRUE),
('Hub Puri Indah',    'Jl. Puri Agung, Puri Indah, Jakarta Barat',                 ST_GeogFromText('POINT(106.7400 -6.2050)'), (SELECT id FROM zones WHERE code = 'JKT-BAR'), TRUE),
('Hub Cawang',        'Jl. MT Haryono, Cawang, Jakarta Timur',                     ST_GeogFromText('POINT(106.8643 -6.2376)'), (SELECT id FROM zones WHERE code = 'JKT-TIM'), TRUE),
('Hub Kelapa Gading', 'Jl. Boulevard Raya, Kelapa Gading, Jakarta Utara',          ST_GeogFromText('POINT(106.9006 -6.1579)'), (SELECT id FROM zones WHERE code = 'JKT-UTA'), TRUE),
('Hub Mangga Dua',    'Jl. Mangga Dua Raya, Sawah Besar, Jakarta Utara',           ST_GeogFromText('POINT(106.8280 -6.1428)'), (SELECT id FROM zones WHERE code = 'JKT-UTA'), TRUE),
('Hub Tebet',         'Jl. Tebet Raya, Tebet, Jakarta Selatan',                    ST_GeogFromText('POINT(106.8496 -6.2363)'), (SELECT id FROM zones WHERE code = 'JKT-SEL'), TRUE);

-- -------------------------------------------------------
-- 3. Pricing Configs (semua 3 model)
-- -------------------------------------------------------
INSERT INTO pricing_configs (model, base_fee, per_km_fee, min_distance_km, max_distance_km, weight_limit_kg, is_active)
VALUES
    ('p2p',        12000, 2500, 0,  15, 20, TRUE),
    ('two_legs',   18000, 2000, 10, 25, 25, TRUE),
    ('three_legs', 25000, 1800, 20, 50, 30, TRUE);

-- -------------------------------------------------------
-- 4. SLA Configs per model/leg
-- -------------------------------------------------------
INSERT INTO sla_configs (model, leg_number, max_minutes, warning_minutes, is_active)
VALUES
    ('p2p',        1, 45, 10, TRUE),
    ('two_legs',   1, 35,  8, TRUE),
    ('two_legs',   2, 35,  8, TRUE),
    ('three_legs', 1, 30,  7, TRUE),
    ('three_legs', 2, 30,  7, TRUE),
    ('three_legs', 3, 30,  7, TRUE)
ON CONFLICT (model, leg_number) DO NOTHING;

-- -------------------------------------------------------
-- 5. 15 Feature Flags dengan default values
-- -------------------------------------------------------
INSERT INTO feature_flags (key, name, description, is_enabled, category, require_checklist, config) VALUES
('model_p2p',                     'Point-to-Point',       'Standard P2P single courier delivery',                        TRUE,  'model',   FALSE, '{"active_zones":["JKT-PST","JKT-SEL","JKT-BAR","JKT-TIM","JKT-UTA"],"rollout_pct":100}'::jsonb),
('model_two_legs',                'Two-Legs Relay',        'Relay delivery with 1 meeting point, max 25km',               TRUE,  'model',   FALSE, '{"active_zones":["JKT-PST","JKT-SEL","JKT-BAR","JKT-TIM","JKT-UTA"],"rollout_pct":100}'::jsonb),
('model_three_legs',              'Three-Legs Relay',      'High distance relay with 2 meeting points',                   FALSE, 'model',   TRUE,  '{"active_zones":[],"rollout_pct":0}'::jsonb),
('dynamic_pricing_peak_hour',     'Peak Hour Surge',       'Increase price during peak hours (07-09, 17-20 WIB)',         TRUE,  'pricing', FALSE, '{"peak_hours":[[7,9],[17,20]],"max_multiplier":1.4}'::jsonb),

('dynamic_pricing_demand_supply', 'Demand-Supply Surge',   'Increase price when courier density low per zone',            TRUE,  'pricing', FALSE, '{"ratio_threshold":0.5,"max_multiplier":1.2}'::jsonb),
('volumetric_scanning',           'Volumetric Scanning',   'ML-based package dimension scanning via camera',              TRUE,  'feature', FALSE, '{"confidence_threshold":0.75}'::jsonb),
('arcore_scanning',               'ARCore Scanning',       'Enhanced AR depth sensor scanning (for supported devices)',   FALSE, 'feature', FALSE, '{"min_android_version":24}'::jsonb),
('package_insurance',             'Package Insurance',     'Optional per-order package insurance via PasarPolis',         TRUE,  'feature', FALSE, '{"max_coverage_idr":5000000}'::jsonb),
('in_app_chat',                   'In-App Chat',           'Masked number in-app chat between customer and courier',      TRUE,  'feature', FALSE, '{}'::jsonb),
('loyalty_program',               'Loyalty Program',       'Customer tier rewards and cashback system',                   TRUE,  'feature', FALSE, '{"tiers":["bronze","silver","gold","platinum"]}'::jsonb),
('referral_program',              'Referral Program',      'Customer referral code and reward tracking',                  TRUE,  'feature', FALSE, '{"reward_idr":20000,"referrer_reward_idr":10000}'::jsonb),
('scheduled_delivery',            'Scheduled Delivery',    'Allow customers to schedule deliveries up to 7 days ahead',  FALSE, 'feature', FALSE, '{"max_days_ahead":7}'::jsonb),
('require_payment_gateway',       'Payment Gateway',       'Enable/disable integration with Midtrans',                    TRUE,  'system',  FALSE, '{}'::jsonb),
('multi_zone_courier',            'Multi-Zone Courier',    'Allow couriers to be assigned to multiple zones',             TRUE,  'system',  FALSE, '{"max_zones":3}'::jsonb),
('courier_leaderboard',           'Courier Leaderboard',   'Weekly relay score leaderboard visible to couriers',          TRUE,  'system',  FALSE, '{"top_n":10}'::jsonb)
ON CONFLICT (key) DO UPDATE
    SET name              = EXCLUDED.name,
        description       = EXCLUDED.description,
        category          = EXCLUDED.category,
        require_checklist = EXCLUDED.require_checklist,
        config            = EXCLUDED.config;

-- -------------------------------------------------------
-- 6. Notification Templates
-- -------------------------------------------------------
INSERT INTO notification_templates (key, channel, title, body, is_active) VALUES
('order_confirmed',    'push',      'Pesanan Dikonfirmasi',  'Pesanan {{order_number}} sudah dikonfirmasi. Kurir sedang dalam perjalanan!',            TRUE),
('order_picked_up',    'push',      'Paket Sudah Diambil',   'Paket kamu sudah diambil oleh {{courier_name}} pada pukul {{pickup_time}}.',              TRUE),
('order_delivered',    'push',      'Paket Terkirim!',       'Paket {{order_number}} sudah berhasil dikirim ke {{recipient_name}}.',                    TRUE),
('order_cancelled',    'push',      'Pesanan Dibatalkan',    'Pesanan {{order_number}} dibatalkan. Refund akan diproses dalam 1-3 hari kerja.',          TRUE),
('payment_success',    'push',      'Pembayaran Berhasil',   'Pembayaran untuk pesanan {{order_number}} sebesar {{amount}} berhasil diterima.',          TRUE),
('sla_warning_courier','push',      'SLA Hampir Habis!',     'Kamu punya {{remaining_minutes}} menit untuk menyelesaikan leg ini. Segera bergerak!',    TRUE),
('courier_approved',   'whatsapp',  NULL,                    'Selamat! Akun kurir kamu telah disetujui. Silakan login dan mulai terima order.',          TRUE),
('courier_rejected',   'whatsapp',  NULL,                    'Maaf, verifikasi kurir kamu belum berhasil. Alasan: {{rejection_reason}}.',               TRUE),
('otp_login',          'whatsapp',  NULL,                    'Kode OTP TEMBUS kamu adalah *{{otp_code}}*. Berlaku 5 menit. Jangan bagikan ke siapapun.',TRUE),
('flag_changed',       'in_app',    'Feature Flag Diubah',   'Flag {{flag_key}} diubah menjadi {{new_state}} oleh {{admin_name}}.',                     TRUE),
('score_changed',      'in_app',    'Relay Score Berubah',   'Relay score kamu berubah dari {{score_before}} menjadi {{score_after}}. {{reason}}',      TRUE)
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------
-- 7. Default Super Admin
-- -------------------------------------------------------
INSERT INTO users (phone_number, full_name, role, status, referral_code)
VALUES ('+628123456789', 'Master Administrator', 'super_admin', 'active', 'ADMIN000')
ON CONFLICT (phone_number) DO NOTHING;

-- -------------------------------------------------------
-- 8. Development Vouchers
-- -------------------------------------------------------
INSERT INTO vouchers (code, name, type, value, min_order_idr, quota, is_active, valid_until)
VALUES
    ('TEMBUS10',   'Diskon 10% Semua Model',  'percentage',    10,    15000, 500,  TRUE, NOW() + INTERVAL '6 months'),
    ('NEWUSER20K', 'Voucher User Baru 20rb',  'fixed',         20000, 0,     1000, TRUE, NOW() + INTERVAL '3 months'),
    ('RELAY2KAKI', 'Gratis 2-Kaki Pertama',   'free_shipping', 18000, 10000, 200,  TRUE, NOW() + INTERVAL '2 months')
ON CONFLICT (code) DO NOTHING;

-- +goose Down
DELETE FROM vouchers WHERE code IN ('TEMBUS10','NEWUSER20K','RELAY2KAKI');
DELETE FROM users WHERE phone_number = '+628123456789' AND role = 'super_admin';
DELETE FROM notification_templates;
DELETE FROM feature_flags;
DELETE FROM sla_configs;
DELETE FROM pricing_configs;
DELETE FROM meeting_points WHERE name LIKE 'Hub %';
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS updated_at;
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS created_at;
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS is_active;
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS weight_limit_kg;
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS max_distance_km;
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS min_distance_km;
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS per_km_fee;
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS base_fee;
ALTER TABLE pricing_configs DROP COLUMN IF EXISTS model;
ALTER TABLE meeting_points DROP COLUMN IF EXISTS updated_at;
ALTER TABLE meeting_points DROP COLUMN IF EXISTS created_at;
ALTER TABLE meeting_points DROP COLUMN IF EXISTS is_active;
ALTER TABLE meeting_points DROP COLUMN IF EXISTS zone_id;
ALTER TABLE meeting_points DROP COLUMN IF EXISTS location;
ALTER TABLE meeting_points DROP COLUMN IF EXISTS address;
ALTER TABLE meeting_points DROP COLUMN IF EXISTS name;
