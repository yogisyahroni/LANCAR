-- sprint3_readiness_mv.sql
-- Ini adalah contoh struktur Materialized View untuk readiness 3-Kaki

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_three_legs_readiness AS
SELECT 
    -- SLA calculations placeholder (in a real system this aggregates order_logs)
    87.3 AS sla_current_avg,
    FALSE AS all_above_93,
    -- Checklist calculations placeholder
    28 AS courier_density_jaktim,
    22 AS courier_density_jakbar,
    31 AS courier_density_jakpst,
    4 AS validated_meeting_points,
    187 AS daily_orders_avg
;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_three_legs ON mv_three_legs_readiness (sla_current_avg);
-- REFRESH MATERIALIZED VIEW mv_three_legs_readiness;
