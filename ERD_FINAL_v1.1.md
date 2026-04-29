# ENTITY RELATIONSHIP DIAGRAM (ERD)
## Platform Logistik Hyperlocal Relay
### Versi 1.1 — April 2026

> **Changelog v1.1 (29 April 2026):** Tabel `feature_flags` diperluas dengan kolom `category` & `require_checklist`. Tabel baru `feature_flag_logs` (immutable audit trail) ditambahkan. Seed data 15 flags, query patterns Go/TypeScript, Redis schema, dan ERD relasi baru tersedia di Seksi 7–11.

---

## 1. DIAGRAM ERD (Mermaid)

```mermaid
erDiagram
    USERS {
        uuid id PK
        string phone_number UK
        string email
        string full_name
        string photo_url
        enum role "customer|courier|admin|super_admin"
        enum status "active|inactive|suspended|pending_verification"
        string referral_code UK
        uuid referred_by FK
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    CUSTOMER_PROFILES {
        uuid id PK
        uuid user_id FK UK
        enum loyalty_tier "bronze|silver|gold"
        int total_orders
        int total_spent_idr
        string ktp_url
        enum ktp_status "none|pending|verified"
        timestamp created_at
        timestamp updated_at
    }

    COURIER_PROFILES {
        uuid id PK
        uuid user_id FK UK
        string ktp_url
        string sim_url
        string stnk_url
        string selfie_url
        enum vehicle_type "bebek|matic|sport"
        string vehicle_plate UK
        int vehicle_cc
        decimal relay_score
        enum verification_status "pending|approved|rejected"
        string rejection_reason
        enum tier "regular|mitra|elite"
        boolean is_online
        decimal current_lat
        decimal current_lng
        timestamp last_location_at
        int acceptance_rate_pct
        int completion_rate_pct
        int ontime_rate_pct
        timestamp created_at
        timestamp updated_at
    }

    COURIER_ZONES {
        uuid id PK
        uuid courier_id FK
        uuid zone_id FK
        boolean is_primary
        timestamp assigned_at
        timestamp removed_at
    }

    ZONES {
        uuid id PK
        string name
        string code UK
        jsonb polygon_coordinates
        decimal center_lat
        decimal center_lng
        boolean is_active
        int max_couriers
        timestamp created_at
        timestamp updated_at
    }

    ZONE_ADJACENCIES {
        uuid id PK
        uuid zone_id FK
        uuid adjacent_zone_id FK
        int relay_priority
    }

    MEETING_POINTS {
        uuid id PK
        uuid zone_a_id FK
        uuid zone_b_id FK
        string name
        string address
        decimal lat
        decimal lng
        int buffer_radius_normal_m
        int buffer_radius_heavy_m
        boolean is_active
        int usage_count
        uuid fallback_1_id FK
        uuid fallback_2_id FK
        timestamp created_at
    }

    ORDERS {
        uuid id PK
        string order_number UK
        uuid customer_id FK
        enum model "p2p|two_legs|three_legs"
        enum status "pending_payment|pending_assignment|assigned|picked_up|in_transit|in_relay_1|in_relay_2|delivered|failed|cancelled|disputed"
        decimal pickup_lat
        decimal pickup_lng
        string pickup_address
        string pickup_notes
        decimal dropoff_lat
        decimal dropoff_lng
        string dropoff_address
        string dropoff_notes
        string recipient_name
        string recipient_phone_masked
        decimal distance_km
        int base_price_idr
        int volumetric_surcharge_idr
        int weight_surcharge_idr
        int dynamic_price_idr
        int loyalty_discount_idr
        int insurance_premium_idr
        int total_price_idr
        int ppn_idr
        int mdr_idr
        boolean has_insurance
        int insured_value_idr
        string customer_notes
        enum schedule_type "now|scheduled"
        timestamp scheduled_at
        timestamp assigned_at
        timestamp picked_up_at
        timestamp delivered_at
        timestamp cancelled_at
        string cancellation_reason
        timestamp created_at
        timestamp updated_at
    }

    ORDER_ITEMS {
        uuid id PK
        uuid order_id FK
        string item_name
        string item_category
        decimal actual_weight_kg
        decimal scanned_length_cm
        decimal scanned_width_cm
        decimal scanned_height_cm
        decimal volumetric_weight_kg
        decimal charged_weight_kg
        decimal scan_confidence_score
        string pickup_photo_url
        string delivery_photo_url
        timestamp created_at
    }

    ORDER_LEGS {
        uuid id PK
        uuid order_id FK
        int leg_number "1|2|3"
        uuid courier_id FK
        uuid zone_id FK
        uuid pickup_meeting_point_id FK
        uuid dropoff_meeting_point_id FK
        enum status "pending|assigned|picked_up|in_transit|handed_over|delivered|failed|cancelled"
        decimal pickup_lat
        decimal pickup_lng
        decimal dropoff_lat
        decimal dropoff_lng
        int assigned_fee_idr
        int penalty_idr
        int idle_compensation_idr
        timestamp sla_deadline
        timestamp assigned_at
        timestamp started_at
        timestamp completed_at
        timestamp created_at
        timestamp updated_at
    }

    ORDER_HANDOVERS {
        uuid id PK
        uuid order_id FK
        uuid from_leg_id FK
        uuid to_leg_id FK
        uuid from_courier_id FK
        uuid to_courier_id FK
        uuid meeting_point_id FK
        string package_qr_code
        string handover_video_url
        enum package_condition "ok|damaged"
        string damage_description
        string damage_photo_url
        decimal handover_lat
        decimal handover_lng
        timestamp handover_at
        int idle_wait_minutes
        timestamp created_at
    }

    ORDER_PROOFS {
        uuid id PK
        uuid order_id FK
        uuid order_leg_id FK
        enum proof_type "pickup_photo|delivery_photo|esignature|recipient_id|handover_video"
        string file_url
        decimal location_lat
        decimal location_lng
        string recipient_name
        timestamp captured_at
        timestamp created_at
    }

    ORDER_STATUS_HISTORY {
        uuid id PK
        uuid order_id FK
        uuid order_leg_id FK
        enum from_status
        enum to_status
        uuid changed_by FK
        string change_reason
        decimal location_lat
        decimal location_lng
        timestamp changed_at
    }

    PACKAGE_SCANS {
        uuid id PK
        uuid order_id FK
        uuid scanned_by FK
        enum scanned_by_role "customer|courier"
        string image_url
        decimal detected_length_cm
        decimal detected_width_cm
        decimal detected_height_cm
        decimal volumetric_weight_kg
        decimal confidence_score
        boolean is_manual_override
        string override_reason
        timestamp scanned_at
    }

    PRICING_CONFIGS {
        uuid id PK
        enum model "p2p|two_legs|three_legs"
        jsonb leg_fees "per-leg flat fees"
        jsonb distance_brackets "per-km brackets for p2p"
        jsonb weight_surcharges "per bracket"
        jsonb dimension_surcharges
        decimal volumetric_divisor
        boolean is_active
        uuid created_by FK
        timestamp effective_from
        timestamp effective_to
        timestamp created_at
    }

    DYNAMIC_PRICING_RULES {
        uuid id PK
        enum factor_type "peak_hour|weather|demand_supply"
        jsonb config "time ranges, thresholds, multipliers"
        boolean is_active
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    DYNAMIC_PRICING_LOGS {
        uuid id PK
        uuid order_id FK
        jsonb factors_applied
        decimal base_price_idr
        decimal final_price_idr
        decimal total_multiplier
        timestamp calculated_at
    }

    WEATHER_LOGS {
        uuid id PK
        uuid zone_id FK
        string source "bmkg|openmeteo"
        int rain_intensity "0-5"
        string condition
        decimal temperature_c
        decimal wind_speed_kmh
        decimal pricing_multiplier_applied
        timestamp recorded_at
    }

    COURIER_LOCATIONS {
        uuid id PK
        uuid courier_id FK
        decimal lat
        decimal lng
        decimal accuracy_m
        decimal heading_degrees
        decimal speed_kmh
        boolean is_spoofed
        timestamp recorded_at
    }

    COURIER_GPS_LOGS {
        uuid id PK
        uuid courier_id FK
        uuid order_id FK
        uuid order_leg_id FK
        jsonb gps_trail "array of {lat,lng,ts}"
        decimal total_distance_km
        int duration_minutes
        timestamp leg_started_at
        timestamp leg_ended_at
        timestamp created_at
    }

    PAYMENTS {
        uuid id PK
        uuid order_id FK
        string payment_number UK
        enum provider "midtrans|xendit"
        enum method "qris"
        enum status "pending|paid|failed|expired|refunded|partially_refunded"
        int amount_idr
        int mdr_amount_idr
        int ppn_amount_idr
        int weather_reserve_idr
        int net_operational_idr
        string provider_reference
        string qr_code_url
        string qr_code_string
        timestamp expires_at
        timestamp paid_at
        timestamp created_at
        timestamp updated_at
    }

    PAYOUTS {
        uuid id PK
        uuid courier_id FK
        uuid order_leg_id FK
        enum payout_type "delivery_fee|penalty_receive|idle_compensation|bonus"
        int gross_amount_idr
        int tax_amount_idr
        int net_amount_idr
        enum status "pending|processing|completed|failed"
        string bank_code
        string bank_account
        string bank_name
        string provider_reference
        timestamp processed_at
        timestamp created_at
    }

    REFUNDS {
        uuid id PK
        uuid order_id FK
        uuid payment_id FK
        enum reason "cancelled|sla_breach|dispute_resolved|system_error"
        int amount_idr
        enum status "pending|processing|completed|failed"
        string provider_reference
        timestamp processed_at
        timestamp created_at
    }

    SLA_CONFIGS {
        uuid id PK
        enum model "p2p|two_legs|three_legs"
        int leg_number
        int sla_minutes
        decimal penalty_pct
        int idle_compensation_per_15min_idr
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    SLA_LOGS {
        uuid id PK
        uuid order_leg_id FK
        uuid courier_id FK
        timestamp sla_deadline
        timestamp actual_completion_at
        int breach_minutes "negative = early, positive = late"
        boolean is_breach
        int penalty_applied_idr
        int compensation_applied_idr
        timestamp created_at
    }

    COURIER_RATINGS {
        uuid id PK
        uuid order_id FK
        uuid order_leg_id FK
        uuid courier_id FK
        uuid rated_by FK
        enum rater_type "customer|courier_partner"
        int stars "1-5"
        string comment
        boolean is_public
        timestamp created_at
    }

    RELAY_SCORES {
        uuid id PK
        uuid courier_id FK
        decimal score "1.0-5.0"
        decimal ontime_score
        decimal documentation_score
        decimal partner_rating_score
        decimal complaint_score
        int total_orders_calculated
        timestamp calculated_at
        timestamp created_at
    }

    RELAY_SCORE_HISTORY {
        uuid id PK
        uuid courier_id FK
        decimal score_before
        decimal score_after
        string change_reason
        uuid reference_id
        enum reference_type "order|sla_breach|complaint|bonus"
        timestamp changed_at
    }

    DISPUTES {
        uuid id PK
        uuid order_id FK
        uuid opened_by FK
        enum category "package_damaged|not_delivered|courier_behavior|wrong_price|other"
        string description
        string evidence_urls
        enum status "open|investigating|resolved|escalated|closed"
        uuid assigned_to FK
        string resolution_note
        int compensation_idr
        enum compensation_type "refund|voucher|insurance"
        timestamp opened_at
        timestamp resolved_at
        timestamp created_at
        timestamp updated_at
    }

    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        uuid order_id FK
        enum channel "push|whatsapp|sms|in_app"
        enum type "order_update|sla_warning|payment|promo|system"
        string title
        string body
        jsonb data
        enum status "pending|sent|delivered|failed|read"
        timestamp sent_at
        timestamp read_at
        timestamp created_at
    }

    VOUCHERS {
        uuid id PK
        string code UK
        enum type "percentage|fixed"
        int value
        int max_discount_idr
        int min_order_idr
        int total_quota
        int used_count
        uuid zone_restriction FK
        enum tier_restriction "all|silver|gold"
        boolean is_active
        timestamp valid_from
        timestamp valid_until
        uuid created_by FK
        timestamp created_at
    }

    VOUCHER_USAGES {
        uuid id PK
        uuid voucher_id FK
        uuid order_id FK
        uuid user_id FK
        int discount_applied_idr
        timestamp used_at
    }

    COURIER_INSURANCE {
        uuid id PK
        uuid courier_id FK
        enum package_type "basic|optimal|maximum"
        enum status "active|inactive|expired"
        int monthly_premium_idr
        int company_contribution_idr
        int courier_contribution_idr
        string bpjs_reference
        string micro_insurance_reference
        timestamp start_date
        timestamp end_date
        timestamp created_at
    }

    INSURANCE_CLAIMS {
        uuid id PK
        uuid courier_id FK
        uuid order_id FK
        uuid dispute_id FK
        enum claim_type "accident|package_lost|package_damaged"
        int claimed_amount_idr
        int approved_amount_idr
        enum status "pending|investigating|approved|rejected|paid"
        string documents_urls
        string rejection_reason
        timestamp submitted_at
        timestamp resolved_at
        timestamp created_at
    }

    ADMIN_LOGS {
        uuid id PK
        uuid admin_id FK
        string action
        string resource_type
        uuid resource_id
        jsonb before_state
        jsonb after_state
        string ip_address
        string user_agent
        timestamp created_at
    }

    FEATURE_FLAGS {
        uuid id PK
        string key UK
        boolean is_enabled
        jsonb config
        string description
        string category "model|pricing|feature|system"
        boolean require_checklist
        uuid updated_by FK
        timestamp updated_at
        timestamp created_at
    }

    FEATURE_FLAG_LOGS {
        uuid id PK
        uuid flag_id FK
        string flag_key
        uuid changed_by FK
        boolean before_enabled
        boolean after_enabled
        jsonb before_config
        jsonb after_config
        text change_reason
        jsonb checklist_data
        string ip_address
        boolean totp_verified
        timestamp changed_at
    }

    REFERRALS {
        uuid id PK
        uuid referrer_id FK
        uuid referred_id FK
        enum status "pending|completed|rewarded"
        int reward_idr
        uuid order_id FK
        timestamp completed_at
        timestamp created_at
    }

    %% RELATIONSHIPS
    USERS ||--o| CUSTOMER_PROFILES : "has"
    USERS ||--o| COURIER_PROFILES : "has"
    USERS ||--o{ COURIER_ZONES : "assigned to"
    USERS ||--o{ ORDERS : "places"
    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ REFERRALS : "refers"
    USERS ||--o{ COURIER_RATINGS : "gives"
    USERS ||--o{ DISPUTES : "opens"
    USERS ||--o{ ADMIN_LOGS : "performs"
    USERS ||--o{ FEATURE_FLAGS : "last_updated_by"
    USERS ||--o{ FEATURE_FLAG_LOGS : "changed_by"
    FEATURE_FLAGS ||--o{ FEATURE_FLAG_LOGS : "has history" 

    COURIER_PROFILES ||--o{ COURIER_ZONES : "has"
    COURIER_PROFILES ||--o{ COURIER_LOCATIONS : "tracks"
    COURIER_PROFILES ||--o{ COURIER_GPS_LOGS : "logs"
    COURIER_PROFILES ||--o{ RELAY_SCORES : "has"
    COURIER_PROFILES ||--o{ RELAY_SCORE_HISTORY : "records"
    COURIER_PROFILES ||--o{ COURIER_INSURANCE : "covered by"
    COURIER_PROFILES ||--o{ PAYOUTS : "receives"
    COURIER_PROFILES ||--o{ COURIER_RATINGS : "rated in"

    ZONES ||--o{ ZONE_ADJACENCIES : "has"
    ZONES ||--o{ MEETING_POINTS : "has"
    ZONES ||--o{ COURIER_ZONES : "contains"
    ZONES ||--o{ WEATHER_LOGS : "monitors"

    MEETING_POINTS ||--o{ ORDER_LEGS : "used in"
    MEETING_POINTS ||--o{ ORDER_HANDOVERS : "happens at"

    ORDERS ||--|| ORDER_ITEMS : "contains"
    ORDERS ||--o{ ORDER_LEGS : "has"
    ORDERS ||--o{ ORDER_HANDOVERS : "has"
    ORDERS ||--o{ ORDER_PROOFS : "has"
    ORDERS ||--o{ ORDER_STATUS_HISTORY : "tracks"
    ORDERS ||--o{ PACKAGE_SCANS : "has"
    ORDERS ||--o{ DYNAMIC_PRICING_LOGS : "priced by"
    ORDERS ||--|| PAYMENTS : "paid via"
    ORDERS ||--o{ REFUNDS : "refunded"
    ORDERS ||--o{ DISPUTES : "has"
    ORDERS ||--o{ VOUCHER_USAGES : "uses"
    ORDERS ||--o{ NOTIFICATIONS : "triggers"

    ORDER_LEGS ||--o{ SLA_LOGS : "tracked by"
    ORDER_LEGS ||--o{ COURIER_RATINGS : "rated for"
    ORDER_LEGS ||--o{ ORDER_PROOFS : "has"
    ORDER_LEGS ||--o{ PAYOUTS : "generates"

    PAYMENTS ||--o{ PAYOUTS : "funds"
    PAYMENTS ||--o{ REFUNDS : "refunds"

    DISPUTES ||--o{ INSURANCE_CLAIMS : "triggers"

    VOUCHERS ||--o{ VOUCHER_USAGES : "used in"

    PRICING_CONFIGS ||--o{ ORDERS : "applied to"
    DYNAMIC_PRICING_RULES ||--o{ DYNAMIC_PRICING_LOGS : "results in"
```

---

## 2. DETAIL TABEL DATABASE

### 2.1 Database: PostgreSQL 15+ dengan PostGIS extension

**Extension yang wajib diinstall:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- UUID generation
CREATE EXTENSION IF NOT EXISTS "postgis";       -- Geospatial
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query monitoring
```

---

### 2.2 Tabel: users

```sql
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
```

---

### 2.3 Tabel: courier_profiles

```sql
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

-- Spatial index untuk kurir terdekat
CREATE INDEX idx_courier_location ON courier_profiles USING GIST(current_location);
CREATE INDEX idx_courier_online ON courier_profiles(is_online) WHERE is_online = TRUE;
CREATE INDEX idx_courier_score ON courier_profiles(relay_score);
```

---

### 2.4 Tabel: zones

```sql
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
```

---

### 2.5 Tabel: orders

```sql
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
-- Composite untuk admin dashboard
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
```

---

### 2.6 Tabel: order_legs

```sql
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
```

---

### 2.7 Tabel: package_scans

```sql
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
```

---

### 2.8 Tabel: courier_locations (time-series, hot table)

```sql
-- Gunakan TimescaleDB atau partisi per hari untuk performa
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

-- Buat partisi per bulan
CREATE TABLE courier_locations_2026_05 PARTITION OF courier_locations
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Spatial index
CREATE INDEX idx_courier_loc_courier_time ON courier_locations(courier_id, recorded_at DESC);
CREATE INDEX idx_courier_loc_spatial ON courier_locations USING GIST(location);

-- Retention: hapus data >90 hari via scheduled job
```

---

### 2.9 Tabel: payments

```sql
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
```

---

### 2.10 Tabel: disputes

```sql
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
```

---

### 2.11 Tabel: feature_flags (DIPERBARUI v1.1)

```sql
CREATE TABLE feature_flags (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key               VARCHAR(100) UNIQUE NOT NULL,
    is_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
    config            JSONB,
    description       TEXT NOT NULL,
    category          VARCHAR(50) NOT NULL DEFAULT 'general',
    -- 'model'     = model pengiriman (model_p2p, model_two_legs, model_three_legs)
    -- 'pricing'   = dynamic pricing (peak_hour, weather, demand_supply)
    -- 'feature'   = fitur produk (scanning, chat, loyalty, dll)
    -- 'system'    = config sistem internal
    require_checklist BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = tidak bisa di-toggle tanpa checklist konfirmasi (khusus model_three_legs)
    updated_by        UUID REFERENCES users(id),
    updated_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_feature_flags_key      ON feature_flags(key);
CREATE INDEX        idx_feature_flags_category ON feature_flags(category);
CREATE INDEX        idx_feature_flags_enabled  ON feature_flags(is_enabled);
```

**Perubahan dari v1.0:** Ditambahkan kolom `category` (klasifikasi flag) dan `require_checklist` (flag yang butuh validasi checklist sebelum diaktifkan — khusus `model_three_legs`).

**Default flags saat deployment:**

| key | is_enabled | category | require_checklist |
|---|---|---|---|
| `model_p2p` | ✅ TRUE | model | FALSE |
| `model_two_legs` | ✅ TRUE | model | FALSE |
| `model_three_legs` | ❌ FALSE | model | **TRUE** |
| `dynamic_pricing_peak_hour` | ✅ TRUE | pricing | FALSE |
| `dynamic_pricing_weather` | ✅ TRUE | pricing | FALSE |
| `dynamic_pricing_demand_supply` | ✅ TRUE | pricing | FALSE |
| `volumetric_scanning` | ✅ TRUE | feature | FALSE |
| `arcore_scanning` | ❌ FALSE | feature | FALSE |
| `package_insurance` | ✅ TRUE | feature | FALSE |
| `in_app_chat` | ✅ TRUE | feature | FALSE |
| `loyalty_program` | ✅ TRUE | feature | FALSE |
| `referral_program` | ✅ TRUE | feature | FALSE |
| `scheduled_delivery` | ❌ FALSE | feature | FALSE |
| `multi_zone_courier` | ✅ TRUE | feature | FALSE |
| `courier_leaderboard` | ✅ TRUE | feature | FALSE |

---

### 2.12 Tabel: feature_flag_logs (BARU v1.1 — Immutable Audit Trail)

```sql
CREATE TABLE feature_flag_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_id         UUID NOT NULL REFERENCES feature_flags(id),
    flag_key        VARCHAR(100) NOT NULL,
    changed_by      UUID NOT NULL REFERENCES users(id),
    before_enabled  BOOLEAN NOT NULL,
    after_enabled   BOOLEAN NOT NULL,
    before_config   JSONB,
    after_config    JSONB,
    change_reason   TEXT NOT NULL CHECK (LENGTH(change_reason) >= 50),
    checklist_data  JSONB,
    ip_address      VARCHAR(50),
    user_agent      TEXT,
    totp_verified   BOOLEAN DEFAULT FALSE,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ff_logs_flag    ON feature_flag_logs(flag_id);
CREATE INDEX idx_ff_logs_changed ON feature_flag_logs(changed_at DESC);
CREATE INDEX idx_ff_logs_by      ON feature_flag_logs(changed_by);

-- IMMUTABLE: Trigger mencegah UPDATE atau DELETE
CREATE OR REPLACE FUNCTION prevent_ff_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'feature_flag_logs is immutable — UPDATE/DELETE tidak diizinkan';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ff_log_immutable
    BEFORE UPDATE OR DELETE ON feature_flag_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_ff_log_mutation();
```

**Kolom penting:**
- `change_reason` — CHECK constraint minimal 50 karakter (tidak bisa diisi asal)
- `checklist_data` — JSONB snapshot kondisi 3-Leg checklist saat aktivasi (NULL untuk flag biasa)
- `totp_verified` — catat apakah 2FA sudah diverifikasi di session tersebut
- **Seluruh tabel ini tidak bisa di-UPDATE atau DELETE** — hanya INSERT via aplikasi

---

## 3. REDIS CACHE SCHEMA

```
# Kurir online per zona
SMEMBERS zone:online:{zone_id}          → Set of courier_ids
EXPIRE zone:online:{zone_id} 60         → Refresh setiap menit

# Lokasi kurir terkini (untuk dashboard & customer tracking)
GET courier:location:{courier_id}       → JSON: {lat, lng, heading, speed, ts}
SET courier:location:{courier_id} {json} EX 30

# Order state (untuk WebSocket broadcast)
GET order:state:{order_id}              → JSON state lengkap
SET order:state:{order_id} {json} EX 3600

# Pricing cache per rute populer
GET pricing:{pickup_zone}:{dropoff_zone}:{model} → {price, eta, expires}
EX 300                                   → Cache 5 menit

# Dynamic pricing multiplier per zona
GET pricing:multiplier:{zone_id}        → JSON: {jam, cuaca, demand}
EX 60                                    → Update tiap menit

# Session & auth
GET session:{user_id}:{device_id}       → JWT payload
EX 86400                                 → 24 jam

# Rate limiting
GET ratelimit:{user_id}                 → counter
EX 60                                    → Reset per menit

# OTP
GET otp:{phone}                         → {code, expires, attempts}
EX 300                                   → 5 menit

# SLA timer
GET sla:{order_leg_id}                  → {deadline, warning_sent}

# Feature flags cache (TTL 60 detik — read-heavy, rarely written)
GET flag:{key}                          → JSON: {is_enabled, config, require_checklist, category}
SET flag:{key} {json}                    EX 60
# Contoh:
# GET flag:model_p2p         → {"is_enabled":true,"config":{...},"require_checklist":false}
# GET flag:model_three_legs  → {"is_enabled":false,"config":{...},"require_checklist":true}

# Invalidasi manual oleh admin setelah toggle:
DEL flag:{key}                           ← routing engine pakai cache lama max 60 detik

# Readiness data cache (untuk dashboard admin, TTL 5 menit)
GET readiness:three_legs                → JSON: {gate, checklist, overall_ready, estimated_weeks}
SET readiness:three_legs {json}          EX 300

# Cuaca per zona
GET weather:{zone_id}                   → {intensity, condition, multiplier}
EX 900                                   → Cache 15 menit
```

---

## 4. S3 / OBJECT STORAGE STRUCTURE

```
bucket: relay-logistics-{env}/
│
├── courier-docs/
│   └── {courier_id}/
│       ├── ktp_{timestamp}.jpg
│       ├── sim_{timestamp}.jpg
│       ├── stnk_{timestamp}.jpg
│       └── selfie_{timestamp}.jpg
│
├── package-scans/
│   └── {order_id}/
│       ├── scan_{timestamp}_1.jpg
│       └── scan_{timestamp}_2.jpg
│
├── order-proofs/
│   └── {order_id}/
│       ├── pickup_{leg_id}_{timestamp}.jpg
│       ├── handover_{handover_id}_{timestamp}.mp4
│       └── delivery_{leg_id}_{timestamp}.jpg
│
├── dispute-evidence/
│   └── {dispute_id}/
│       └── evidence_{timestamp}.jpg
│
└── exports/
    └── {year}/{month}/
        └── report_{type}_{date}.pdf
```

---

## 5. SEQUENCE DIAGRAM: ORDER FLOW

### 5.1 P2P Order Flow

```
Customer App          Backend API          Courier App         DB/Redis
     │                    │                    │                  │
     │─ POST /orders ─────►                    │                  │
     │                    │─ validate ─────────────────────────── │
     │                    │─ calculate price ──────────────────── │
     │                    │─ POST /payments ──────────────────────│
     │◄─ 200: QR Code ────│                    │                  │
     │─ (QRIS Payment) ──►│                    │                  │
     │                    │◄── Webhook paid ───────────────────── │
     │                    │─ match courier ────────────────────── │
     │                    │──────────────────── WS: order:new ───►│
     │                    │                    │─ accept ─────────►
     │◄── WS: assigned ───│                    │                  │
     │                    │                    │─ navigate pickup  │
     │                    │                    │─ PATCH status:    │
     │                    │                    │  picked_up ───────►
     │◄── WS: picked_up ──│                    │                  │
     │                    │                    │─ navigate dropoff │
     │                    │                    │─ PATCH status:    │
     │                    │                    │  delivered ───────►
     │◄── WS: delivered ──│                    │                  │
     │─ rate courier ─────►                    │                  │
     │                    │─ update relay score────────────────── │
     │                    │─ trigger payout ─────────────────────►│
```

### 5.2 3-Kaki Relay Flow

```
Customer     Backend     Courier A     Courier B     Courier C     DB
   │            │            │             │             │           │
   │─ order ───►│            │             │             │           │
   │            │─ match all 3 couriers ────────────────────────────│
   │            │──────────── WS: new ───►│             │           │
   │            │─────────────────────────── WS: new ──►│           │
   │            │──────────────────────────────────────── WS:new ──►│
   │            │            │─ accept ───►             │           │
   │            │            │             │─ accept ───►           │
   │            │            │             │             │─accept ──►│
   │            │            │─ pickup ────────────────────────────►│
   │◄── WS:picked_up ───────►│             │             │           │
   │            │            │─navigate meetpoint 1 ─────────────── │
   │            │            │             │─ navigate meetpoint 1 ──│
   │            │            │── at meetpoint 1 ──────────────────► │
   │            │            │             │── at meetpoint 1 ──────►│
   │            │            │─ HANDOVER (QR + Video) ─►            │
   │            │            │             │─ scan QR ──►           │
   │◄── WS: in_relay_1 ─────►│             │             │           │
   │            │            │             │─ navigate meetpoint 2 ──│
   │            │            │             │             │─navigate──►│
   │            │            │             │─ HANDOVER ──►           │
   │◄── WS: in_relay_2 ─────►│             │             │           │
   │            │            │             │             │─ deliver─►│
   │◄── WS: delivered ───────►            │             │           │
```

---

## 6. STATE MACHINE: ORDER STATUS

```
                    ┌─────────────────┐
          ┌─────────► PENDING_PAYMENT │
          │         └────────┬────────┘
          │                  │ payment confirmed
          │         ┌────────▼──────────┐
          │         │ PENDING_ASSIGNMENT │
          │         └────────┬──────────┘
          │                  │ courier(s) assigned
          │         ┌────────▼──────────┐
          │  cancel │    ASSIGNED        │◄──── admin override
          │◄─────── └────────┬──────────┘
          │                  │ courier pickup confirmed
          │         ┌────────▼──────────┐
          │         │    PICKED_UP       │
          │         └────────┬──────────┘
          │                  │ (for relay)
          │         ┌────────▼──────────┐
          │         │   IN_RELAY_1       │ (Kurir A → B)
          │         └────────┬──────────┘
          │                  │ (for 3-kaki)
          │         ┌────────▼──────────┐
          │         │   IN_RELAY_2       │ (Kurir B → C)
          │         └────────┬──────────┘
          │                  │ last courier delivery confirmed
          │         ┌────────▼──────────┐
          │         │    DELIVERED       │ ← TERMINAL STATE ✅
          │         └───────────────────┘
          │
          │         ┌─────────────┐
          └─────────►  CANCELLED  │ ← TERMINAL STATE ❌
                    └─────────────┘
          
          ┌─────────────┐
          │   DISPUTED   │ ← Can branch from DELIVERED or PICKED_UP
          └──────┬──────┘
                 │
          ┌──────▼──────┐
          │   FAILED    │ ← TERMINAL STATE ⚠️
          └─────────────┘
```


---

## 7. FEATURE FLAG — CONFIG JSON SCHEMA PER MODEL

### 7.1 model_p2p
```json
{
  "max_distance_km": 15,
  "active_zones": ["JAK-TIM", "JAK-BAR", "JAK-PST", "JAK-UTR", "JAK-SEL"],
  "rollout_pct": 100,
  "fallback_if_disabled": "reject_with_message",
  "rejection_message_id": "MSG_P2P_UNAVAILABLE"
}
```

### 7.2 model_two_legs
```json
{
  "max_distance_km": 25,
  "active_zones": ["JAK-TIM", "JAK-BAR", "JAK-PST", "JAK-UTR", "JAK-SEL"],
  "min_courier_density_per_zone": 10,
  "rollout_pct": 100,
  "fallback_if_disabled": "reject_with_message",
  "rejection_message_id": "MSG_TWO_LEGS_UNAVAILABLE"
}
```

### 7.3 model_three_legs (NONAKTIF DEFAULT)
```json
{
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
}
```

---

## 8. FEATURE FLAG — QUERY PATTERNS

### 8.1 Flag Reader dengan Cache (Go — routing-service)

```go
func GetFlag(ctx context.Context, key string) (*FeatureFlag, error) {
    cacheKey := fmt.Sprintf("flag:%s", key)

    // 1. Cek Redis cache
    cached, err := redis.Get(ctx, cacheKey).Result()
    if err == nil {
        var flag FeatureFlag
        json.Unmarshal([]byte(cached), &flag)
        return &flag, nil
    }

    // 2. Cache miss → query DB
    var flag FeatureFlag
    err = db.QueryRowContext(ctx,
        `SELECT id, key, is_enabled, config, category, require_checklist
         FROM feature_flags WHERE key = $1`, key,
    ).Scan(&flag.ID, &flag.Key, &flag.IsEnabled,
           &flag.Config, &flag.Category, &flag.RequireChecklist)
    if err != nil { return nil, err }

    // 3. Simpan ke Redis TTL 60 detik
    data, _ := json.Marshal(flag)
    redis.Set(ctx, cacheKey, data, 60*time.Second)
    return &flag, nil
}
```

### 8.2 Model Selector dengan Flag Check (Go)

```go
func SelectModel(ctx context.Context, req OrderRequest) (ModelType, error) {
    // Baca 3 flags paralel (goroutine)
    var p2p, two, three *FeatureFlag
    var eg errgroup.Group
    eg.Go(func() error { p2p, _ = GetFlag(ctx, "model_p2p"); return nil })
    eg.Go(func() error { two, _ = GetFlag(ctx, "model_two_legs"); return nil })
    eg.Go(func() error { three, _ = GetFlag(ctx, "model_three_legs"); return nil })
    eg.Wait()

    dist := calculateDistance(req.Pickup, req.Dropoff)
    pZone := detectZone(req.Pickup)
    dZone := detectZone(req.Dropoff)

    switch {
    case dist <= 15:
        if p2p.IsEnabled && zoneActive(p2p, pZone) { return ModelP2P, nil }
        return "", ErrModelUnavailable("MSG_P2P_UNAVAILABLE")
    case dist <= 25:
        if two.IsEnabled && zonesActive(two, pZone, dZone) { return ModelTwoLegs, nil }
        if three.IsEnabled && zonesActive(three, pZone, dZone) { return ModelThreeLegs, nil }
        return "", ErrModelUnavailable("MSG_TWO_LEGS_UNAVAILABLE")
    default:
        if three.IsEnabled && zonesActive(three, pZone, dZone) { return ModelThreeLegs, nil }
        return "", ErrModelUnavailable("MSG_THREE_LEGS_UNAVAILABLE")
    }
}
```

### 8.3 Toggle Flag oleh Super Admin (TypeScript)

```typescript
async function toggleFlag(params: {
    adminId: string, flagKey: string, newEnabled: boolean,
    reason: string, totpCode: string,
    checklistData?: ThreeLegChecklist
}): Promise<void> {

    // Validasi: role super_admin + 2FA
    const admin = await getUser(params.adminId);
    if (admin.role !== 'super_admin') throw new ForbiddenError();
    if (!await verifyTOTP(params.adminId, params.totpCode)) throw new TwoFAError();

    const flag = await db.featureFlags.findOne({ key: params.flagKey });

    // Checklist wajib untuk model_three_legs saat diaktifkan
    if (flag.require_checklist && params.newEnabled) {
        await validateActivationChecklist(params.flagKey, params.checklistData);
    }

    // Transaction: update flag + insert immutable log
    await db.transaction(async (trx) => {
        await trx.featureFlags.update(
            { key: params.flagKey },
            { is_enabled: params.newEnabled, updated_by: params.adminId, updated_at: new Date() }
        );
        await trx.featureFlagLogs.create({
            flag_id: flag.id, flag_key: params.flagKey,
            changed_by: params.adminId,
            before_enabled: flag.is_enabled, after_enabled: params.newEnabled,
            before_config: flag.config, after_config: flag.config,
            change_reason: params.reason,
            checklist_data: params.checklistData || null,
            totp_verified: true, changed_at: new Date()
        });
    });

    // Invalidate Redis cache
    await redis.del(`flag:${params.flagKey}`);
    // Broadcast via WebSocket ke semua admin dashboard
    await websocket.broadcast('flag:changed', { key: params.flagKey, enabled: params.newEnabled });
    // Notifikasi semua super_admin
    await notifyAllSuperAdmins(params.flagKey, flag.is_enabled, params.newEnabled, params.reason);
}
```

---

## 9. ERD RELASI BARU (v1.1)

```
users ─────────────────────────────────────────────────────────────────┐
  │ (updated_by)                                                        │ (changed_by)
  ▼                                                                     ▼
feature_flags                                            feature_flag_logs
  │ id (PK)                                                 │ id (PK)
  │ key (UNIQUE)                              ──────────────► flag_id → feature_flags.id (FK)
  │ is_enabled                               │               │ flag_key (snapshot)
  │ config (JSONB)          ◄────────────────┘               │ changed_by → users.id (FK)
  │ description                                              │ before_enabled / after_enabled
  │ category                                                 │ before_config / after_config (JSONB)
  │ require_checklist                                        │ change_reason (min 50 char)
  │ updated_by → users.id (FK)                              │ checklist_data (JSONB, nullable)
  │ updated_at                                               │ totp_verified
  │ created_at                                               │ changed_at
  │                                                          │ [IMMUTABLE — trigger prevent UPDATE/DELETE]
  └──────────────────────────────────────────────────────────┘
               1 feature_flags : M feature_flag_logs
```

---

## 10. RBAC MATRIX — FEATURE FLAGS

| Role | GET flags | GET logs | Edit config | Toggle ON/OFF | Aktifkan 3-Kaki |
|---|---|---|---|---|---|
| `super_admin` | ✅ | ✅ | ✅ | ✅ | ✅ (checklist + 2FA) |
| `ops_manager` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `zone_manager` | ✅ (zona sendiri) | ❌ | ❌ | ❌ | ❌ |
| `finance` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `cs_agent` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `courier` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `customer` | ❌ | ❌ | ❌ | ❌ | ❌ |
