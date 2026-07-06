-- Migration: Add logistics fields to orders
-- Date: 2026-07-06

BEGIN;

ALTER TABLE orders
ADD COLUMN logistics_provider VARCHAR(20),
ADD COLUMN logistics_service_type VARCHAR(30),
ADD COLUMN logistics_tariff_idr BIGINT,
ADD COLUMN logistics_net_cost_idr BIGINT;

COMMIT;
