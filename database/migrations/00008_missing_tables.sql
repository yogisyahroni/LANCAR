-- +goose Up
-- ============================================================
-- Migration 00008: Missing Tables from ERD
-- LANCAR Hyperlocal Relay Platform
-- ============================================================

-- -------------------------------------------------------
-- SLA Logs: track every SLA breach per order leg
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sla_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_leg_id        UUID NOT NULL REFERENCES order_legs(id),
    order_id            UUID NOT NULL REFERENCES orders(id),
    courier_id          UUID NOT NULL REFERENCES users(id),
    sla_deadline        TIMESTAMPTZ NOT NULL,
    breach_detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    breach_minutes      INT NOT NULL,
    penalty_idr         INT NOT NULL DEFAULT 0,
    penalty_distributed_to VARCHAR(30), -- 'next_courier' | 'customer_voucher'
    compensation_idr    INT DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sla_logs_order ON sla_logs(order_id);
CREATE INDEX idx_sla_logs_courier ON sla_logs(courier_id);
CREATE INDEX idx_sla_logs_detected ON sla_logs(breach_detected_at DESC);

-- -------------------------------------------------------
-- Relay Score History: track score changes per courier
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS relay_score_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id      UUID NOT NULL REFERENCES courier_profiles(id),
    score_before    DECIMAL(4,2) NOT NULL,
    score_after     DECIMAL(4,2) NOT NULL,
    change_reason   VARCHAR(100) NOT NULL, -- 'order_completed' | 'sla_breach' | 'admin_override' | 'complaint'
    order_id        UUID REFERENCES orders(id),
    admin_id        UUID REFERENCES users(id),   -- set if admin_override
    admin_note      TEXT,
    tier_before     VARCHAR(20),
    tier_after      VARCHAR(20),
    calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_relay_score_history_courier ON relay_score_history(courier_id);
CREATE INDEX idx_relay_score_history_time ON relay_score_history(calculated_at DESC);

-- -------------------------------------------------------
-- Weather Logs: BMKG polling results per zone
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id             UUID NOT NULL REFERENCES zones(id),
    source              VARCHAR(20) NOT NULL DEFAULT 'bmkg', -- 'bmkg' | 'open_meteo'
    rain_intensity_mm   DECIMAL(8,2) DEFAULT 0,
    weather_condition   VARCHAR(50),
    surge_multiplier    DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    is_applied          BOOLEAN DEFAULT TRUE,
    polled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weather_logs_zone ON weather_logs(zone_id);
CREATE INDEX idx_weather_logs_polled ON weather_logs(polled_at DESC);

-- -------------------------------------------------------
-- Notifications: in-app + push notification inbox
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    title           VARCHAR(255) NOT NULL,
    body            TEXT NOT NULL,
    type            VARCHAR(50) NOT NULL, -- 'order_update' | 'payment' | 'sla_alert' | 'system' | 'flag_change'
    icon            VARCHAR(50),
    image_url       TEXT,
    deep_link       TEXT,
    channel         VARCHAR(20) NOT NULL DEFAULT 'in_app', -- 'in_app' | 'push' | 'whatsapp' | 'sms'
    is_read         BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    -- Delivery tracking
    push_status     VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'sent' | 'delivered' | 'failed'
    push_error      TEXT,
    sent_at         TIMESTAMPTZ,
    -- Reference
    order_id        UUID REFERENCES orders(id),
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- -------------------------------------------------------
-- Notification Templates: admin-configurable templates
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key         VARCHAR(100) UNIQUE NOT NULL, -- 'order_confirmed', 'order_delivered', 'sla_warning'
    channel     VARCHAR(20) NOT NULL,         -- 'push' | 'whatsapp' | 'sms' | 'email'
    title       VARCHAR(255),
    body        TEXT NOT NULL,               -- supports {{variable}} placeholders
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_templates_key ON notification_templates(key);

-- -------------------------------------------------------
-- Payout Records: courier earnings per order leg
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_records (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id          UUID NOT NULL REFERENCES users(id),
    order_leg_id        UUID REFERENCES order_legs(id),
    order_id            UUID REFERENCES orders(id),
    type                VARCHAR(30) NOT NULL, -- 'leg_fee' | 'idle_compensation' | 'bonus' | 'penalty'
    gross_idr           INT NOT NULL DEFAULT 0,
    penalty_idr         INT NOT NULL DEFAULT 0,
    idle_compensation_idr INT NOT NULL DEFAULT 0,
    net_idr             INT NOT NULL DEFAULT 0,
    pph21_idr           INT NOT NULL DEFAULT 0,
    disbursement_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
    disbursement_ref    VARCHAR(255),         -- Xendit/Flip transfer reference
    disbursement_at     TIMESTAMPTZ,
    failure_reason      TEXT,
    retry_count         SMALLINT DEFAULT 0,
    batch_date          DATE,                 -- date of batch payout
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payout_courier ON payout_records(courier_id);
CREATE INDEX idx_payout_status ON payout_records(disbursement_status);
CREATE INDEX idx_payout_batch ON payout_records(batch_date DESC);
CREATE INDEX idx_payout_order ON payout_records(order_id);

-- -------------------------------------------------------
-- Courier Ratings: per-order ratings by customer
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS courier_ratings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id    UUID NOT NULL REFERENCES orders(id),
    order_leg_id UUID REFERENCES order_legs(id),
    courier_id  UUID NOT NULL REFERENCES users(id),
    rated_by    UUID NOT NULL REFERENCES users(id), -- customer
    stars       SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment     TEXT,
    tags        TEXT[],                              -- ['fast','polite','careful']
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_courier_ratings_order_courier ON courier_ratings(order_id, courier_id);
CREATE INDEX idx_courier_ratings_courier ON courier_ratings(courier_id);

-- -------------------------------------------------------
-- Vouchers: discount & referral vouchers
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vouchers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                VARCHAR(50) UNIQUE NOT NULL,
    name                VARCHAR(255) NOT NULL,
    type                VARCHAR(30) NOT NULL, -- 'percentage' | 'fixed' | 'free_shipping' | 'sla_compensation'
    value               INT NOT NULL,          -- percentage (1-100) or fixed IDR
    max_discount_idr    INT,
    min_order_idr       INT DEFAULT 0,
    quota               INT,                   -- NULL = unlimited
    used_count          INT DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    is_single_use       BOOLEAN DEFAULT FALSE,
    applicable_models   TEXT[],               -- ['p2p','two_legs'] or NULL for all
    valid_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until         TIMESTAMPTZ,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vouchers_code ON vouchers(code);
CREATE INDEX idx_vouchers_active ON vouchers(is_active) WHERE is_active = TRUE;

-- -------------------------------------------------------
-- Voucher Usages: track who used which voucher
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS voucher_usages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id  UUID NOT NULL REFERENCES vouchers(id),
    order_id    UUID NOT NULL REFERENCES orders(id),
    user_id     UUID NOT NULL REFERENCES users(id),
    discount_idr INT NOT NULL,
    used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(voucher_id, order_id)
);

CREATE INDEX idx_voucher_usages_voucher ON voucher_usages(voucher_id);
CREATE INDEX idx_voucher_usages_user ON voucher_usages(user_id);

-- -------------------------------------------------------
-- Referral Tracking
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_rewards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id     UUID NOT NULL REFERENCES users(id),
    referred_id     UUID NOT NULL REFERENCES users(id),
    referral_code   VARCHAR(20) NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'completed' | 'expired'
    reward_type     VARCHAR(30), -- 'voucher' | 'cashback'
    reward_value    INT,
    reward_voucher_id UUID REFERENCES vouchers(id),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(referred_id)
);

CREATE INDEX idx_referral_rewards_referrer ON referral_rewards(referrer_id);
CREATE INDEX idx_referral_rewards_code ON referral_rewards(referral_code);

-- -------------------------------------------------------
-- Saved Addresses: customer address book
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_addresses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    label       VARCHAR(100) NOT NULL,  -- 'Rumah', 'Kantor', 'Gudang'
    address     TEXT NOT NULL,
    location    GEOGRAPHY(POINT, 4326) NOT NULL,
    notes       TEXT,
    is_default  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_addresses_user ON saved_addresses(user_id);

-- -------------------------------------------------------
-- Courier GPS Logs: GPS trail per leg (audit trail)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS courier_gps_logs (
    id              UUID DEFAULT uuid_generate_v4(),
    courier_id      UUID NOT NULL REFERENCES users(id),
    order_leg_id    UUID REFERENCES order_legs(id),
    location        GEOGRAPHY(POINT, 4326) NOT NULL,
    accuracy_m      DECIMAL(8,2),
    speed_kmh       DECIMAL(6,2),
    heading_deg     DECIMAL(5,2),
    is_spoofed      BOOLEAN DEFAULT FALSE,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

CREATE TABLE IF NOT EXISTS courier_gps_logs_2026_05
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS courier_gps_logs_2026_06
    PARTITION OF courier_gps_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX idx_gps_logs_courier_time ON courier_gps_logs(courier_id, recorded_at DESC);
CREATE INDEX idx_gps_logs_leg ON courier_gps_logs(order_leg_id, recorded_at DESC);

-- -------------------------------------------------------
-- Courier Insurance Records
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS courier_insurance (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id      UUID NOT NULL REFERENCES courier_profiles(id),
    type            VARCHAR(30) NOT NULL, -- 'bpjs_tk' | 'accident' | 'package'
    provider        VARCHAR(100),
    policy_number   VARCHAR(100),
    coverage_idr    INT,
    premium_monthly_idr INT,
    company_share_idr   INT,
    courier_share_idr   INT,
    status          VARCHAR(20) DEFAULT 'active', -- 'active' | 'expired' | 'pending' | 'cancelled'
    valid_from      DATE NOT NULL,
    valid_until     DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courier_insurance_courier ON courier_insurance(courier_id);
CREATE INDEX idx_courier_insurance_status ON courier_insurance(status);
CREATE INDEX idx_courier_insurance_expiry ON courier_insurance(valid_until) WHERE status = 'active';

-- -------------------------------------------------------
-- SLA Config: configurable SLA per model per leg
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sla_configs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model           VARCHAR(20) NOT NULL CHECK (model IN ('p2p','two_legs','three_legs')),
    leg_number      SMALLINT NOT NULL,
    max_minutes     INT NOT NULL,
    warning_minutes INT NOT NULL, -- alert N minutes before breach
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(model, leg_number)
);

-- -------------------------------------------------------
-- Dynamic Pricing Logs: track multiplier changes per zone
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dynamic_pricing_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id         UUID NOT NULL REFERENCES zones(id),
    factor          VARCHAR(30) NOT NULL, -- 'peak_hour' | 'weather' | 'demand_supply'
    multiplier      DECIMAL(4,2) NOT NULL,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ
);

CREATE INDEX idx_dynamic_pricing_zone ON dynamic_pricing_logs(zone_id, applied_at DESC);

-- +goose Down
DROP TABLE IF EXISTS dynamic_pricing_logs;
DROP TABLE IF EXISTS sla_configs;
DROP TABLE IF EXISTS courier_insurance;
DROP TABLE IF EXISTS courier_gps_logs_2026_06;
DROP TABLE IF EXISTS courier_gps_logs_2026_05;
DROP TABLE IF EXISTS courier_gps_logs;
DROP TABLE IF EXISTS saved_addresses;
DROP TABLE IF EXISTS referral_rewards;
DROP TABLE IF EXISTS voucher_usages;
DROP TABLE IF EXISTS vouchers;
DROP TABLE IF EXISTS courier_ratings;
DROP TABLE IF EXISTS payout_records;
DROP TABLE IF EXISTS notification_templates;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS weather_logs;
DROP TABLE IF EXISTS relay_score_history;
DROP TABLE IF EXISTS sla_logs;
