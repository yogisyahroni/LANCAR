-- +goose Up
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number  VARCHAR(20) UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE,
    full_name     VARCHAR(255) NOT NULL,
    photo_url     TEXT,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('customer','courier','ops_admin','finance_admin','cs_agent','zone_manager','super_admin')),
    status        VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended','pending_verification')),
    referral_code VARCHAR(20) UNIQUE,
    referred_by   UUID REFERENCES users(id),
    pin_hash      VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_referral ON users(referral_code);

CREATE TABLE courier_profiles (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID UNIQUE NOT NULL REFERENCES users(id),
    ktp_url               TEXT,
    sim_url               TEXT,
    stnk_url              TEXT,
    selfie_url            TEXT,
    vehicle_type          VARCHAR(20) CHECK (vehicle_type IN ('bebek','matic','sport')),
    vehicle_plate         VARCHAR(20) UNIQUE,
    vehicle_cc            INT,
    relay_score           DECIMAL(3,2) DEFAULT 5.00 CHECK (relay_score BETWEEN 1.0 AND 5.0),
    verification_status   VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')),
    rejection_reason      TEXT,
    tier                  VARCHAR(20) DEFAULT 'regular' CHECK (tier IN ('regular','mitra','elite')),
    is_online             BOOLEAN DEFAULT FALSE,
    current_location      GEOGRAPHY(POINT, 4326),
    last_location_at      TIMESTAMPTZ,
    acceptance_rate_pct   INT DEFAULT 100 CHECK (acceptance_rate_pct BETWEEN 0 AND 100),
    completion_rate_pct   INT DEFAULT 100 CHECK (completion_rate_pct BETWEEN 0 AND 100),
    ontime_rate_pct       INT DEFAULT 100 CHECK (ontime_rate_pct BETWEEN 0 AND 100),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courier_location ON courier_profiles USING GIST(current_location);
CREATE INDEX idx_courier_online ON courier_profiles(is_online) WHERE is_online = TRUE;
CREATE INDEX idx_courier_score ON courier_profiles(relay_score);

CREATE TABLE zones (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(100) NOT NULL,
    code              VARCHAR(20) UNIQUE NOT NULL,
    polygon           GEOGRAPHY(POLYGON, 4326) NOT NULL,
    center            GEOGRAPHY(POINT, 4326),
    is_active         BOOLEAN DEFAULT TRUE,
    max_couriers      INT DEFAULT 100,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_zones_polygon ON zones USING GIST(polygon);
CREATE INDEX idx_zones_active ON zones(is_active) WHERE is_active = TRUE;

CREATE TABLE courier_zones (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id        UUID NOT NULL REFERENCES courier_profiles(id),
    zone_id           UUID NOT NULL REFERENCES zones(id),
    is_primary        BOOLEAN DEFAULT FALSE,
    assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at        TIMESTAMPTZ,
    UNIQUE(courier_id, zone_id)
);

CREATE INDEX idx_courier_zones_courier ON courier_zones(courier_id);
CREATE INDEX idx_courier_zones_zone ON courier_zones(zone_id);

CREATE TABLE pricing_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);

CREATE TABLE orders (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number            VARCHAR(30) UNIQUE NOT NULL,
    customer_id             UUID NOT NULL REFERENCES users(id),
    model                   VARCHAR(20) NOT NULL CHECK (model IN ('p2p','two_legs','three_legs')),
    status                  VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
    pickup_location         GEOGRAPHY(POINT, 4326) NOT NULL,
    pickup_address          TEXT NOT NULL,
    pickup_notes            TEXT,
    dropoff_location        GEOGRAPHY(POINT, 4326) NOT NULL,
    dropoff_address         TEXT NOT NULL,
    dropoff_notes           TEXT,
    recipient_name          VARCHAR(255),
    recipient_phone_masked  VARCHAR(20),
    distance_km             DECIMAL(10,2),
    base_price_idr          INT NOT NULL,
    volumetric_surcharge_idr INT DEFAULT 0,
    weight_surcharge_idr    INT DEFAULT 0,
    dynamic_price_idr       INT DEFAULT 0,
    loyalty_discount_idr    INT DEFAULT 0,
    insurance_premium_idr   INT DEFAULT 0,
    total_price_idr         INT NOT NULL,
    ppn_idr                 INT NOT NULL,
    mdr_idr                 INT NOT NULL,
    has_insurance           BOOLEAN DEFAULT FALSE,
    insured_value_idr       INT,
    customer_notes          TEXT,
    schedule_type           VARCHAR(20) DEFAULT 'now',
    scheduled_at            TIMESTAMPTZ,
    pricing_config_id       UUID REFERENCES pricing_configs(id),
    assigned_at             TIMESTAMPTZ,
    picked_up_at            TIMESTAMPTZ,
    delivered_at            TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    cancellation_reason     TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_model ON orders(model);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_pickup ON orders USING GIST(pickup_location);
CREATE INDEX idx_orders_dropoff ON orders USING GIST(dropoff_location);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

CREATE TABLE meeting_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);

CREATE TABLE order_legs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id                UUID NOT NULL REFERENCES orders(id),
    leg_number              SMALLINT NOT NULL CHECK (leg_number IN (1,2,3)),
    courier_id              UUID REFERENCES users(id),
    zone_id                 UUID REFERENCES zones(id),
    pickup_meeting_point_id UUID REFERENCES meeting_points(id),
    dropoff_meeting_point_id UUID REFERENCES meeting_points(id),
    status                  VARCHAR(30) NOT NULL DEFAULT 'pending',
    pickup_location         GEOGRAPHY(POINT, 4326),
    dropoff_location        GEOGRAPHY(POINT, 4326),
    assigned_fee_idr        INT NOT NULL,
    penalty_idr             INT DEFAULT 0,
    idle_compensation_idr   INT DEFAULT 0,
    sla_deadline            TIMESTAMPTZ,
    assigned_at             TIMESTAMPTZ,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_id, leg_number)
);

CREATE INDEX idx_order_legs_order ON order_legs(order_id);
CREATE INDEX idx_order_legs_courier ON order_legs(courier_id);
CREATE INDEX idx_order_legs_status ON order_legs(status);
CREATE INDEX idx_order_legs_sla ON order_legs(sla_deadline) WHERE status NOT IN ('delivered','failed','cancelled');

CREATE TABLE package_scans (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id             UUID NOT NULL REFERENCES orders(id),
    scanned_by           UUID NOT NULL REFERENCES users(id),
    scanned_by_role      VARCHAR(20) NOT NULL CHECK (scanned_by_role IN ('customer','courier')),
    image_urls           TEXT[],
    detected_length_cm   DECIMAL(8,2),
    detected_width_cm    DECIMAL(8,2),
    detected_height_cm   DECIMAL(8,2),
    volumetric_weight_kg DECIMAL(8,3),
    confidence_score     DECIMAL(4,3),
    is_manual_override   BOOLEAN DEFAULT FALSE,
    override_reason      TEXT,
    scan_location        GEOGRAPHY(POINT, 4326),
    scanned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_package_scans_order ON package_scans(order_id);
CREATE INDEX idx_package_scans_scanned_by ON package_scans(scanned_by);

CREATE TABLE courier_locations (
    id            UUID DEFAULT uuid_generate_v4(),
    courier_id    UUID NOT NULL REFERENCES courier_profiles(id),
    order_id      UUID REFERENCES orders(id),
    location      GEOGRAPHY(POINT, 4326) NOT NULL,
    accuracy_m    DECIMAL(8,2),
    heading_deg   DECIMAL(5,2),
    speed_kmh     DECIMAL(6,2),
    is_spoofed    BOOLEAN DEFAULT FALSE,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

CREATE TABLE courier_locations_2026_05 PARTITION OF courier_locations FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE INDEX idx_courier_loc_courier_time ON courier_locations(courier_id, recorded_at DESC);
CREATE INDEX idx_courier_loc_spatial ON courier_locations USING GIST(location);

CREATE TABLE payments (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id              UUID UNIQUE NOT NULL REFERENCES orders(id),
    payment_number        VARCHAR(50) UNIQUE NOT NULL,
    provider              VARCHAR(20) NOT NULL CHECK (provider IN ('midtrans','xendit')),
    method                VARCHAR(20) NOT NULL DEFAULT 'qris',
    status                VARCHAR(20) NOT NULL DEFAULT 'pending',
    amount_idr            INT NOT NULL,
    mdr_amount_idr        INT NOT NULL,
    ppn_amount_idr        INT NOT NULL,
    weather_reserve_idr   INT NOT NULL,
    insurance_reserve_idr INT DEFAULT 0,
    net_operational_idr   INT NOT NULL,
    provider_reference    VARCHAR(255),
    qr_code_url           TEXT,
    qr_code_string        TEXT,
    webhook_payload       JSONB,
    expires_at            TIMESTAMPTZ NOT NULL,
    paid_at               TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider_ref ON payments(provider_reference);

CREATE TABLE disputes (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id          UUID NOT NULL REFERENCES orders(id),
    opened_by         UUID NOT NULL REFERENCES users(id),
    category          VARCHAR(50) NOT NULL,
    description       TEXT NOT NULL,
    evidence_urls     TEXT[],
    status            VARCHAR(20) NOT NULL DEFAULT 'open',
    assigned_to       UUID REFERENCES users(id),
    resolution_note   TEXT,
    compensation_idr  INT,
    compensation_type VARCHAR(20),
    opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disputes_order ON disputes(order_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_assigned ON disputes(assigned_to);

-- +goose Down
DROP TABLE IF EXISTS disputes;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS courier_locations_2026_05;
DROP TABLE IF EXISTS courier_locations;
DROP TABLE IF EXISTS package_scans;
DROP TABLE IF EXISTS order_legs;
DROP TABLE IF EXISTS meeting_points;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS pricing_configs;
DROP TABLE IF EXISTS courier_zones;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS courier_profiles;
DROP TABLE IF EXISTS users;
