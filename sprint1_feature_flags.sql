CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist for idempotency during dev
DROP TABLE IF EXISTS feature_flag_logs CASCADE;
DROP TABLE IF EXISTS feature_flags CASCADE;

CREATE TABLE feature_flags (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key           VARCHAR(100) UNIQUE NOT NULL,
    is_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    config        JSONB,
    description   TEXT NOT NULL,
    category      VARCHAR(50) NOT NULL DEFAULT 'general',
    require_checklist BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by    UUID, -- Temporarily removed REFERENCES users(id) if users table isn't created yet, will add if needed or keep it if it exists. Let's try without foreign key first to ensure it runs, or I can add it and handle the error.
    updated_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_feature_flags_key ON feature_flags(key);
CREATE INDEX idx_feature_flags_category ON feature_flags(category);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(is_enabled);

CREATE TABLE feature_flag_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_id         UUID NOT NULL REFERENCES feature_flags(id),
    flag_key        VARCHAR(100) NOT NULL,
    changed_by      UUID NOT NULL, -- Temporarily removed REFERENCES users(id)
    before_enabled  BOOLEAN NOT NULL,
    after_enabled   BOOLEAN NOT NULL,
    before_config   JSONB,
    after_config    JSONB,
    change_reason   TEXT NOT NULL,
    checklist_data  JSONB,
    ip_address      VARCHAR(50),
    user_agent      TEXT,
    totp_verified   BOOLEAN DEFAULT FALSE,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ff_logs_flag    ON feature_flag_logs(flag_id);
CREATE INDEX idx_ff_logs_changed ON feature_flag_logs(changed_at DESC);
CREATE INDEX idx_ff_logs_by      ON feature_flag_logs(changed_by);

CREATE OR REPLACE FUNCTION prevent_ff_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'feature_flag_logs is immutable — no UPDATE or DELETE allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ff_log_immutable
    BEFORE UPDATE OR DELETE ON feature_flag_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_ff_log_mutation();

-- SEED DATA
INSERT INTO feature_flags
    (key, is_enabled, config, description, category, require_checklist)
VALUES

-- ─── MODEL FLAGS ─────────────────────────────────────────────────
(
    'model_p2p',
    TRUE,
    '{
        "max_distance_km": 15,
        "active_zones": ["JAK-TIM","JAK-BAR","JAK-PST","JAK-UTR","JAK-SEL"],
        "rollout_pct": 100,
        "fallback_if_disabled": "reject_with_message",
        "rejection_message_id": "MSG_P2P_UNAVAILABLE"
    }',
    'Model Point-to-Point: 1 kurir pickup sampai delivery (<15 km). Model utama pilot dengan margin 36.4%.',
    'model',
    FALSE
),
(
    'model_two_legs',
    TRUE,
    '{
        "max_distance_km": 25,
        "active_zones": ["JAK-TIM","JAK-BAR","JAK-PST","JAK-UTR","JAK-SEL"],
        "min_courier_density_per_zone": 10,
        "rollout_pct": 100,
        "fallback_if_disabled": "reject_with_message",
        "rejection_message_id": "MSG_TWO_LEGS_UNAVAILABLE"
    }',
    'Model Transfer 2-Kaki: 2 kurir untuk rute menengah (15-25 km). Aktif sejak pilot. Margin 20.3%.',
    'model',
    FALSE
),
(
    'model_three_legs',
    FALSE,
    '{
        "max_distance_km": 50,
        "active_zones": [],
        "min_courier_density_per_zone": 30,
        "activation_trigger": "manual_super_admin_only",
        "rollout_pct": 0,
        "fallback_if_disabled": "reject_with_message",
        "rejection_message_id": "MSG_THREE_LEGS_UNAVAILABLE",
        "activation_checklist": {
            "sla_two_legs_pct_min": 93,
            "sla_two_legs_weeks_min": 4,
            "courier_density_min": 30,
            "meeting_points_validated_min": 5,
            "daily_orders_min": 200
        }
    }',
    'Model Relay 3-Kaki: 3 kurir untuk rute panjang (>25 km). NONAKTIF — aktifkan hanya setelah 3-Leg Activation Framework terpenuhi (SLA 2-Kaki ≥93% selama 4 minggu, dll).',
    'model',
    TRUE
),

-- ─── DYNAMIC PRICING FLAGS ────────────────────────────────────────
(
    'dynamic_pricing_peak_hour',
    TRUE,
    '{
        "ranges": [
            {"start": "07:00", "end": "09:00", "multiplier": 0.20},
            {"start": "16:00", "end": "19:00", "multiplier": 0.20}
        ],
        "timezone": "Asia/Jakarta"
    }',
    'Surge pricing jam sibuk pagi (07-09) dan sore (16-19). Multiplier +20%.',
    'pricing',
    FALSE
),
(
    'dynamic_pricing_weather',
    TRUE,
    '{
        "source_primary": "bmkg",
        "source_fallback": "openmeteo",
        "poll_interval_minutes": 15,
        "levels": [
            {"intensity_min": 2, "intensity_max": 2, "multiplier": 0.15, "label": "hujan_sedang"},
            {"intensity_min": 3, "intensity_max": 5, "multiplier": 0.25, "label": "hujan_lebat"}
        ]
    }',
    'Surge pricing cuaca hujan berdasarkan data BMKG per zona. Multiplier +15% (sedang) atau +25% (lebat).',
    'pricing',
    FALSE
),
(
    'dynamic_pricing_demand_supply',
    TRUE,
    '{
        "check_interval_minutes": 2,
        "surge_threshold_ratio": 0.5,
        "surge_multiplier": 0.10,
        "discount_threshold_ratio": 2.0,
        "discount_multiplier": -0.05
    }',
    'Surge/diskon berdasarkan rasio kurir tersedia vs order aktif per zona.',
    'pricing',
    FALSE
),

-- ─── FEATURE FLAGS ────────────────────────────────────────────────
(
    'volumetric_scanning',
    TRUE,
    '{
        "min_confidence_auto_accept": 0.85,
        "min_confidence_warn": 0.70,
        "max_dimension_cm": 100,
        "reference_object": "standard_card_85x54mm",
        "ml_model_version": "v1.0.0"
    }',
    'Fitur scan dimensi paket via kamera ML. Hitung berat volumetrik P×L×T÷5000.',
    'feature',
    FALSE
),
(
    'arcore_scanning',
    FALSE,
    '{
        "min_android_version": "9",
        "requires_arcore": true,
        "ios_requires_lidar": true,
        "fallback_to_ml": true
    }',
    'Enhancement ARCore/LiDAR untuk akurasi scan ±1-2cm. NONAKTIF — aktifkan di Fase 2 setelah evaluasi.',
    'feature',
    FALSE
),
(
    'package_insurance',
    TRUE,
    '{"premium_pct": 0.2, "max_insured_value_idr": 10000000}',
    'Asuransi barang opsional. Premi 0.2% dari nilai barang.',
    'feature',
    FALSE
),
(
    'in_app_chat',
    TRUE,
    '{"max_message_length": 500, "media_allowed": false}',
    'Chat in-app antara customer dan kurir aktif per order (masked number).',
    'feature',
    FALSE
),
(
    'loyalty_program',
    TRUE,
    '{
        "tiers": [
            {"name":"bronze", "min_orders": 0,  "discount_pct": 0},
            {"name":"silver", "min_orders": 10, "discount_pct": 5},
            {"name":"gold",   "min_orders": 30, "discount_pct": 10}
        ]
    }',
    'Program loyalty tier Bronze/Silver/Gold dengan diskon.',
    'feature',
    FALSE
),
(
    'referral_program',
    TRUE,
    '{"reward_idr": 20000, "min_orders_to_qualify": 1}',
    'Program referral customer. Reward Rp20.000 setelah referred user selesai 1 order.',
    'feature',
    FALSE
),
(
    'scheduled_delivery',
    FALSE,
    '{"max_days_advance": 7, "slot_interval_hours": 1}',
    'Pengiriman terjadwal (max 7 hari ke depan). NONAKTIF — aktifkan di Fase 2.',
    'feature',
    FALSE
),
(
    'multi_zone_courier',
    TRUE,
    '{"max_zones_per_courier": 2}',
    'Kurir bisa di-assign ke maksimal 2 zona kerja.',
    'feature',
    FALSE
),
(
    'courier_leaderboard',
    TRUE,
    '{"update_interval_hours": 24, "top_n": 10}',
    'Leaderboard ranking kurir per zona. Update harian.',
    'feature',
    FALSE
);
