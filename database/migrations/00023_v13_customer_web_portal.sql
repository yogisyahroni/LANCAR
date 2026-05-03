-- +goose Up
-- ============================================================
-- Migration 00023: Customer Web Portal tables & schema v1.3
-- ============================================================

CREATE TABLE IF NOT EXISTS web_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token   VARCHAR(255) UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(45),
    user_agent      TEXT
);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint        TEXT UNIQUE NOT NULL,
    auth_keys       JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bulk_downloads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(50) DEFAULT 'pending',
    file_url        TEXT,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_analytics_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type     VARCHAR(50) NOT NULL,
    data            JSONB NOT NULL,
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, report_type)
);

DROP MATERIALIZED VIEW IF EXISTS mv_customer_daily_stats CASCADE;

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

-- +goose Down
DROP MATERIALIZED VIEW IF EXISTS mv_customer_daily_stats CASCADE;
