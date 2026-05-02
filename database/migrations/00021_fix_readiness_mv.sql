-- +goose Up
-- ============================================================
-- Migration 00021: Fix 3-Leg Readiness Materialized View
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS mv_readiness_three_legs;

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
        -- SLA Stability: Mocking based on real data if possible, or just a placeholder for now
        COALESCE((SELECT ROUND(AVG(CASE WHEN status = 'delivered' THEN 100 ELSE 0 END)) FROM orders WHERE model = 'two_legs' AND created_at >= NOW() - INTERVAL '30 days'), 0) as sla_stability,
        -- Courier Density: Avg couriers across all active zones
        COALESCE((SELECT ROUND(AVG(courier_count)) FROM zone_stats), 0) as courier_density,
        -- Daily Volume: Avg daily orders in last 7 days
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
                ELSE 2 -- Just a placeholder estimate
            END
        ) as readiness_data,
        (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) as overall_ready,
        CASE 
            WHEN (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) THEN 0
            ELSE 2 
        END as estimated_ready_in_weeks,
        (m.sla_stability >= 93 AND m.courier_density >= 30 AND m.daily_volume >= 200) as can_activate,
        NOW() as last_updated
    FROM metrics_calc m
)
SELECT * FROM aggregated_data;

CREATE UNIQUE INDEX idx_mv_readiness_three_legs_updated ON mv_readiness_three_legs(last_updated);

-- +goose Down
DROP MATERIALIZED VIEW IF EXISTS mv_readiness_three_legs;
