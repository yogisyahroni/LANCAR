-- +goose Up
-- ============================================================
-- Migration 20260708000005: Platform Revenue Tracking in Orders
-- TEMBUS Hyperlocal Delivery Platform
-- ============================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'ondemand'
        CHECK (order_type IN ('ondemand', 'aggregator')),
    ADD COLUMN IF NOT EXISTS platform_fee_idr INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS aggregator_handling_fee_idr INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_platform_fee ON orders(platform_fee_idr);

-- +goose Down
-- DROP INDEX IF EXISTS idx_orders_platform_fee;
-- DROP INDEX IF EXISTS idx_orders_type;
-- ALTER TABLE orders
--     DROP COLUMN IF EXISTS aggregator_handling_fee_idr,
--     DROP COLUMN IF EXISTS platform_fee_idr,
--     DROP COLUMN IF EXISTS order_type;
