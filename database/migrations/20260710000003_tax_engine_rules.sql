-- +goose Up
-- ============================================================
-- LANCAR — Tax Engine & Orders/Payments Upgrade (BIGINT)
-- Migration: 20260710000003_tax_engine_rules.sql
-- ============================================================

-- 0. Drop Materialized Views depending on orders table to allow altering column types
DROP MATERIALIZED VIEW IF EXISTS mv_daily_revenue CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_order_funnel CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_customer_daily_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_readiness_three_legs CASCADE;

-- 1. Upgrade Monetary columns in orders and payments to BIGINT
ALTER TABLE orders 
    ALTER COLUMN base_price_idr TYPE BIGINT,
    ALTER COLUMN volumetric_surcharge_idr TYPE BIGINT,
    ALTER COLUMN weight_surcharge_idr TYPE BIGINT,
    ALTER COLUMN dynamic_price_idr TYPE BIGINT,
    ALTER COLUMN loyalty_discount_idr TYPE BIGINT,
    ALTER COLUMN insurance_premium_idr TYPE BIGINT,
    ALTER COLUMN total_price_idr TYPE BIGINT,
    ALTER COLUMN ppn_idr TYPE BIGINT,
    ALTER COLUMN mdr_idr TYPE BIGINT,
    ALTER COLUMN insured_value_idr TYPE BIGINT;

ALTER TABLE payments
    ALTER COLUMN amount_idr TYPE BIGINT,
    ALTER COLUMN mdr_amount_idr TYPE BIGINT,
    ALTER COLUMN ppn_amount_idr TYPE BIGINT,
    ALTER COLUMN weather_reserve_idr TYPE BIGINT,
    ALTER COLUMN insurance_reserve_idr TYPE BIGINT,
    ALTER COLUMN net_operational_idr TYPE BIGINT;

-- 1.5. Recreate Materialized Views
CREATE MATERIALIZED VIEW mv_daily_revenue AS
SELECT 
    date_trunc('day', o.created_at) as report_date,
    z.id as zone_id,
    z.name as zone_name,
    o.model,
    COUNT(o.id) as total_orders,
    SUM(o.total_price_idr) as gross_revenue,
    SUM(o.dynamic_price_idr) as surge_revenue,
    SUM(o.mdr_idr) as total_mdr,
    SUM(o.ppn_idr) as total_ppn
FROM orders o
JOIN zones z ON ST_Intersects(z.polygon, o.pickup_location)
WHERE o.status = 'delivered'
GROUP BY 1, 2, 3, 4;

CREATE INDEX idx_mv_daily_revenue_date ON mv_daily_revenue(report_date);
CREATE INDEX idx_mv_daily_revenue_zone ON mv_daily_revenue(zone_id);

CREATE MATERIALIZED VIEW mv_order_funnel AS
SELECT 
    date_trunc('day', created_at) as report_date,
    status,
    COUNT(id) as order_count
FROM orders
GROUP BY 1, 2;

CREATE INDEX idx_mv_order_funnel_date ON mv_order_funnel(report_date);

CREATE MATERIALIZED VIEW mv_customer_daily_stats AS
SELECT
    o.customer_id,
    DATE(o.created_at AT TIME ZONE 'Asia/Jakarta') AS order_date,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
    COUNT(*) FILTER (WHERE o.status IN ('failed', 'cancelled')) AS failed_orders,
    SUM(o.total_price_idr) AS total_spent_idr,
    AVG(o.total_price_idr) AS avg_order_value_idr,
    AVG(o.distance_km) AS avg_distance_km,
    COUNT(*) FILTER (WHERE o.model = 'p2p') AS p2p_count,
    COUNT(*) FILTER (WHERE o.model = 'two_legs') AS two_legs_count
FROM orders o
WHERE o.status NOT IN ('pending_payment')
GROUP BY o.customer_id, DATE(o.created_at AT TIME ZONE 'Asia/Jakarta');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cust_daily_stats_unique ON mv_customer_daily_stats(customer_id, order_date);
CREATE INDEX IF NOT EXISTS idx_mv_cust_daily_stats_cust ON mv_customer_daily_stats(customer_id);

CREATE MATERIALIZED VIEW mv_readiness_three_legs AS
WITH zone_stats AS (
    SELECT 
        z.name AS zone_name,
        COUNT(cp.id) AS courier_count,
        CASE WHEN COUNT(cp.id) >= 30 THEN true ELSE false END AS is_ready
    FROM zones z
    LEFT JOIN courier_zones cz ON z.id = cz.zone_id
    LEFT JOIN courier_profiles cp ON cz.courier_id = cp.id AND cp.is_online = true
    GROUP BY z.name
),
metrics_calc AS (
    SELECT
        COALESCE((SELECT ROUND(AVG(CASE WHEN status = 'delivered' THEN 100 ELSE 0 END)) FROM orders WHERE model = 'two_legs' AND created_at >= NOW() - INTERVAL '30 days'), 0) as sla_stability,
        COALESCE((SELECT ROUND(AVG(courier_count)) FROM zone_stats), 0) as courier_density,
        COALESCE((SELECT ROUND(COUNT(*) / 7.0) FROM orders WHERE created_at >= NOW() - INTERVAL '7 days'), 0) as daily_volume
),
aggregated_data AS (
    SELECT
        jsonb_build_object(
            'metrics', jsonb_build_array(
                jsonb_build_object(
                    'title', 'SLA Stability',
                    'current', m.sla_stability,
                    'target', 93,
                    'unit', '%',
                    'description', 'Average 2-Kaki SLA over the last 4 weeks.'
                ),
                jsonb_build_object(
                    'title', 'Courier Density',
                    'current', m.courier_density,
                    'target', 30,
                    'unit', ' Avg',
                    'description', 'Minimum courier count per key operational zone.'
                ),
                jsonb_build_object(
                    'title', 'Daily Volume',
                    'current', m.daily_volume,
                    'target', 200,
                    'unit', ' Ord',
                    'description', 'Minimum total daily orders for relay routes.'
                )
            ),
            'zones', (SELECT jsonb_agg(jsonb_build_object('zone', zone_name, 'courier', courier_count, 'ready', is_ready)) FROM zone_stats),
            'overall_ready', (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200),
            'can_activate', (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200),
            'estimated_ready_in_weeks', CASE 
                WHEN (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) THEN 0
                ELSE GREATEST(0, CEIL((200 - m.daily_volume) / 20.0), CEIL((30 - m.courier_density) / 5.0))
            END
        ) as readiness_data,
        (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) as overall_ready,
        CASE 
            WHEN (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) THEN 0
            ELSE GREATEST(0, CEIL((200 - m.daily_volume) / 20.0), CEIL((30 - m.courier_density) / 5.0))
        END as estimated_ready_in_weeks,
        (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) as can_activate,
        NOW() as last_updated
    FROM metrics_calc m
)
SELECT * FROM aggregated_data;

CREATE UNIQUE INDEX idx_mv_readiness_three_legs_updated ON mv_readiness_three_legs(last_updated);

-- 2. Create Tax Rules Table
CREATE TABLE IF NOT EXISTS tax_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g. PPN_11, PPN_12, PPH_21, PPH_23
    name VARCHAR(100) NOT NULL,
    tax_type VARCHAR(20) NOT NULL, -- PPN, PPH, OTHER
    effective_rate_pct NUMERIC(5,2) NOT NULL,
    statutory_rate_pct NUMERIC(5,2) NOT NULL,
    dpp_formula VARCHAR(100) NOT NULL, -- 'FULL', 'SERVICE_FEE_ONLY', 'COMMISSION_ONLY'
    invoice_required BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tax_rules_type ON tax_rules(tax_type);
CREATE INDEX idx_tax_rules_effective ON tax_rules(effective_from, effective_to);

-- 3. Add Tax Snapshot & Price Components to Orders
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS tax_rule_code VARCHAR(50) REFERENCES tax_rules(code),
    ADD COLUMN IF NOT EXISTS ppn_rate_effective_pct NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS ppn_rate_statutory_pct NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS dpp_idr BIGINT,
    ADD COLUMN IF NOT EXISTS tax_invoice_required BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tax_invoice_status VARCHAR(20) DEFAULT 'unissued', -- unissued, draft, exported, submitted, accepted, rejected
    ADD COLUMN IF NOT EXISTS platform_fee_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS promo_subsidy_idr BIGINT DEFAULT 0;

-- 4. Create eFaktur Export Table
CREATE TABLE IF NOT EXISTS tax_efaktur_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_period VARCHAR(10) NOT NULL, -- YYYY-MM
    export_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    total_dpp_idr BIGINT NOT NULL DEFAULT 0,
    total_ppn_idr BIGINT NOT NULL DEFAULT 0,
    exported_by VARCHAR(100),
    file_path TEXT,
    checksum VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tax_efaktur_exports_period ON tax_efaktur_exports(tax_period);

-- +goose Down
DROP TABLE IF EXISTS tax_efaktur_exports;

ALTER TABLE orders
    DROP COLUMN IF EXISTS promo_subsidy_idr,
    DROP COLUMN IF EXISTS platform_fee_pct,
    DROP COLUMN IF EXISTS platform_fee_idr,
    DROP COLUMN IF EXISTS tax_invoice_status,
    DROP COLUMN IF EXISTS tax_invoice_required,
    DROP COLUMN IF EXISTS dpp_idr,
    DROP COLUMN IF EXISTS ppn_rate_statutory_pct,
    DROP COLUMN IF EXISTS ppn_rate_effective_pct,
    DROP COLUMN IF EXISTS tax_rule_code;

DROP TABLE IF EXISTS tax_rules;

DROP MATERIALIZED VIEW IF EXISTS mv_daily_revenue CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_order_funnel CASCADE;

ALTER TABLE payments
    ALTER COLUMN amount_idr TYPE INT,
    ALTER COLUMN mdr_amount_idr TYPE INT,
    ALTER COLUMN ppn_amount_idr TYPE INT,
    ALTER COLUMN weather_reserve_idr TYPE INT,
    ALTER COLUMN insurance_reserve_idr TYPE INT,
    ALTER COLUMN net_operational_idr TYPE INT;

ALTER TABLE orders 
    ALTER COLUMN base_price_idr TYPE INT,
    ALTER COLUMN volumetric_surcharge_idr TYPE INT,
    ALTER COLUMN weight_surcharge_idr TYPE INT,
    ALTER COLUMN dynamic_price_idr TYPE INT,
    ALTER COLUMN loyalty_discount_idr TYPE INT,
    ALTER COLUMN insurance_premium_idr TYPE INT,
    ALTER COLUMN total_price_idr TYPE INT,
    ALTER COLUMN ppn_idr TYPE INT,
    ALTER COLUMN mdr_idr TYPE INT,
    ALTER COLUMN insured_value_idr TYPE INT;

CREATE MATERIALIZED VIEW mv_daily_revenue AS
SELECT 
    date_trunc('day', o.created_at) as report_date,
    z.id as zone_id,
    z.name as zone_name,
    o.model,
    COUNT(o.id) as total_orders,
    SUM(o.total_price_idr) as gross_revenue,
    SUM(o.dynamic_price_idr) as surge_revenue,
    SUM(o.mdr_idr) as total_mdr,
    SUM(o.ppn_idr) as total_ppn
FROM orders o
JOIN zones z ON ST_Intersects(z.polygon, o.pickup_location)
WHERE o.status = 'delivered'
GROUP BY 1, 2, 3, 4;

CREATE INDEX idx_mv_daily_revenue_date ON mv_daily_revenue(report_date);
CREATE INDEX idx_mv_daily_revenue_zone ON mv_daily_revenue(zone_id);

CREATE MATERIALIZED VIEW mv_order_funnel AS
SELECT 
    date_trunc('day', created_at) as report_date,
    status,
    COUNT(id) as order_count
FROM orders
GROUP BY 1, 2;

CREATE INDEX idx_mv_order_funnel_date ON mv_order_funnel(report_date);

CREATE MATERIALIZED VIEW mv_customer_daily_stats AS
SELECT
    o.customer_id,
    DATE(o.created_at AT TIME ZONE 'Asia/Jakarta') AS order_date,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
    COUNT(*) FILTER (WHERE o.status IN ('failed', 'cancelled')) AS failed_orders,
    SUM(o.total_price_idr) AS total_spent_idr,
    AVG(o.total_price_idr) AS avg_order_value_idr,
    AVG(o.distance_km) AS avg_distance_km,
    COUNT(*) FILTER (WHERE o.model = 'p2p') AS p2p_count,
    COUNT(*) FILTER (WHERE o.model = 'two_legs') AS two_legs_count
FROM orders o
WHERE o.status NOT IN ('pending_payment')
GROUP BY o.customer_id, DATE(o.created_at AT TIME ZONE 'Asia/Jakarta');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cust_daily_stats_unique ON mv_customer_daily_stats(customer_id, order_date);
CREATE INDEX IF NOT EXISTS idx_mv_cust_daily_stats_cust ON mv_customer_daily_stats(customer_id);

CREATE MATERIALIZED VIEW mv_readiness_three_legs AS
WITH zone_stats AS (
    SELECT 
        z.name AS zone_name,
        COUNT(cp.id) AS courier_count,
        CASE WHEN COUNT(cp.id) >= 30 THEN true ELSE false END AS is_ready
    FROM zones z
    LEFT JOIN courier_zones cz ON z.id = cz.zone_id
    LEFT JOIN courier_profiles cp ON cz.courier_id = cp.id AND cp.is_online = true
    GROUP BY z.name
),
metrics_calc AS (
    SELECT
        COALESCE((SELECT ROUND(AVG(CASE WHEN status = 'delivered' THEN 100 ELSE 0 END)) FROM orders WHERE model = 'two_legs' AND created_at >= NOW() - INTERVAL '30 days'), 0) as sla_stability,
        COALESCE((SELECT ROUND(AVG(courier_count)) FROM zone_stats), 0) as courier_density,
        COALESCE((SELECT ROUND(COUNT(*) / 7.0) FROM orders WHERE created_at >= NOW() - INTERVAL '7 days'), 0) as daily_volume
),
aggregated_data AS (
    SELECT
        jsonb_build_object(
            'metrics', jsonb_build_array(
                jsonb_build_object(
                    'title', 'SLA Stability',
                    'current', m.sla_stability,
                    'target', 93,
                    'unit', '%',
                    'description', 'Average 2-Kaki SLA over the last 4 weeks.'
                ),
                jsonb_build_object(
                    'title', 'Courier Density',
                    'current', m.courier_density,
                    'target', 30,
                    'unit', ' Avg',
                    'description', 'Minimum courier count per key operational zone.'
                ),
                jsonb_build_object(
                    'title', 'Daily Volume',
                    'current', m.daily_volume,
                    'target', 200,
                    'unit', ' Ord',
                    'description', 'Minimum total daily orders for relay routes.'
                )
            ),
            'zones', (SELECT jsonb_agg(jsonb_build_object('zone', zone_name, 'courier', courier_count, 'ready', is_ready)) FROM zone_stats),
            'overall_ready', (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200),
            'can_activate', (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200),
            'estimated_ready_in_weeks', CASE 
                WHEN (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) THEN 0
                ELSE GREATEST(0, CEIL((200 - m.daily_volume) / 20.0), CEIL((30 - m.courier_density) / 5.0))
            END
        ) as readiness_data,
        (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) as overall_ready,
        CASE 
            WHEN (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) THEN 0
            ELSE GREATEST(0, CEIL((200 - m.daily_volume) / 20.0), CEIL((30 - m.courier_density) / 5.0))
        END as estimated_ready_in_weeks,
        (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) as can_activate,
        NOW() as last_updated
    FROM metrics_calc m
)
SELECT * FROM aggregated_data;

CREATE UNIQUE INDEX idx_mv_readiness_three_legs_updated ON mv_readiness_three_legs(last_updated);
