-- +goose Up
-- ============================================================
-- LANCAR — Tambal Ban & Towing: Order Extensions
-- Migration: 20260725000003_tambalban_order_extensions.sql
-- ============================================================

-- Extend orders table for tambal ban & towing fields
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS service_sub_type VARCHAR(30) NULL 
        CHECK (service_sub_type IN (
            'tambal_ban_motor', 'tambal_ban_mobil', 
            'towing_motor', 'towing_mobil', NULL
        )),
    ADD COLUMN IF NOT EXISTS courier_service_price BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS per_km_rate_applied INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS base_fee_applied INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS toll_cost INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vehicle_type_target VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS vehicle_condition_notes TEXT NULL,
    ADD COLUMN IF NOT EXISTS tire_damage_type VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS service_duration_minutes INT NULL,
    ADD COLUMN IF NOT EXISTS service_notes TEXT NULL;

-- Index for service_sub_type queries
CREATE INDEX IF NOT EXISTS idx_orders_service_sub_type 
    ON orders(service_sub_type) WHERE service_sub_type IS NOT NULL;

-- +goose Down
ALTER TABLE orders
    DROP COLUMN IF EXISTS service_sub_type,
    DROP COLUMN IF EXISTS courier_service_price,
    DROP COLUMN IF EXISTS per_km_rate_applied,
    DROP COLUMN IF EXISTS base_fee_applied,
    DROP COLUMN IF EXISTS toll_cost,
    DROP COLUMN IF EXISTS vehicle_type_target,
    DROP COLUMN IF EXISTS vehicle_condition_notes,
    DROP COLUMN IF EXISTS tire_damage_type,
    DROP COLUMN IF EXISTS service_duration_minutes,
    DROP COLUMN IF EXISTS service_notes;

DROP INDEX IF EXISTS idx_orders_service_sub_type;
