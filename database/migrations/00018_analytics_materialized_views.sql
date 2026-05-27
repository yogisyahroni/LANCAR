-- +goose Up
-- ============================================================
-- Migration 00018: Analytics Materialized Views
-- TEMBUS Hyperlocal Delivery Platform
-- ============================================================

-- 1. Daily Revenue Metrics
-- Aggregates revenue by day, zone (based on pickup), and model.
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

-- 2. SLA Compliance Summary
-- Compliance rate per zone and courier.
CREATE MATERIALIZED VIEW mv_sla_compliance AS
SELECT 
    date_trunc('day', ol.completed_at) as report_date,
    ol.zone_id,
    ol.courier_id,
    COUNT(ol.id) as total_legs,
    COUNT(ol.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sla_logs sl WHERE sl.order_leg_id = ol.id)) as on_time_legs,
    AVG(CASE WHEN EXISTS (SELECT 1 FROM sla_logs sl WHERE sl.order_leg_id = ol.id) THEN 0 ELSE 100 END) as compliance_rate_pct
FROM order_legs ol
WHERE ol.status = 'completed'
GROUP BY 1, 2, 3;

CREATE INDEX idx_mv_sla_compliance_date ON mv_sla_compliance(report_date);
CREATE INDEX idx_mv_sla_compliance_courier ON mv_sla_compliance(courier_id);

-- 3. Courier Utilization Stats
-- Active orders vs potential active hours.
CREATE MATERIALIZED VIEW mv_courier_utilization AS
SELECT 
    date_trunc('day', ol.completed_at) as report_date,
    ol.courier_id,
    COUNT(ol.id) as orders_completed,
    SUM(EXTRACT(EPOCH FROM (ol.completed_at - ol.started_at))/3600) as active_hours
FROM order_legs ol
WHERE ol.status = 'completed' AND ol.started_at IS NOT NULL
GROUP BY 1, 2;

CREATE INDEX idx_mv_courier_util_date ON mv_courier_utilization(report_date);

-- 4. Order Funnel Stats
-- Conversion across statuses.
CREATE MATERIALIZED VIEW mv_order_funnel AS
SELECT 
    date_trunc('day', created_at) as report_date,
    status,
    COUNT(id) as order_count
FROM orders
GROUP BY 1, 2;

CREATE INDEX idx_mv_order_funnel_date ON mv_order_funnel(report_date);

-- 5. Scan Accuracy Distribution
CREATE MATERIALIZED VIEW mv_scan_accuracy AS
SELECT 
    date_trunc('day', scanned_at) as report_date,
    floor(confidence_score * 10) / 10 as confidence_bin,
    COUNT(id) as scan_count
FROM package_scans
GROUP BY 1, 2;

CREATE INDEX idx_mv_scan_accuracy_date ON mv_scan_accuracy(report_date);

-- +goose Down
DROP MATERIALIZED VIEW IF EXISTS mv_scan_accuracy;
DROP MATERIALIZED VIEW IF EXISTS mv_order_funnel;
DROP MATERIALIZED VIEW IF EXISTS mv_courier_utilization;
DROP MATERIALIZED VIEW IF EXISTS mv_sla_compliance;
DROP MATERIALIZED VIEW IF EXISTS mv_daily_revenue;
