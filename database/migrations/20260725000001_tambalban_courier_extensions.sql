-- +goose Up
-- ============================================================
-- LANCAR — Tambal Ban & Towing: Courier Profile Extensions
-- Migration: 20260725000001_tambalban_courier_extensions.sql
-- ============================================================

-- Extend courier_profiles with service capabilities
ALTER TABLE courier_profiles
    ADD COLUMN IF NOT EXISTS service_categories TEXT[] DEFAULT '{"on_demand"}',
    ADD COLUMN IF NOT EXISTS vehicle_type_car VARCHAR(20) 
        CHECK (vehicle_type_car IN ('sedan','mpv','suv','pickup','van','towing_truck')) NULL,
    ADD COLUMN IF NOT EXISTS allows_tambal_ban BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS current_lat NUMERIC(10,7) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_lng NUMERIC(10,7) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS allows_towing BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_deliveries INT DEFAULT 0;

-- GIN index for service_categories array queries
CREATE INDEX IF NOT EXISTS idx_courier_service_categories 
    ON courier_profiles USING GIN(service_categories);

-- Index for online status + location queries
CREATE INDEX IF NOT EXISTS idx_courier_online_location 
    ON courier_profiles(is_online, current_lat, current_lng) 
    WHERE is_online = TRUE;

-- +goose Down
ALTER TABLE courier_profiles
    DROP COLUMN IF EXISTS service_categories,
    DROP COLUMN IF EXISTS vehicle_type_car,
    DROP COLUMN IF EXISTS allows_tambal_ban,
    DROP COLUMN IF EXISTS current_lat,
    DROP COLUMN IF EXISTS current_lng,
    DROP COLUMN IF EXISTS allows_towing,
    DROP COLUMN IF EXISTS is_online,
    DROP COLUMN IF EXISTS avg_rating,
    DROP COLUMN IF EXISTS total_deliveries;

DROP INDEX IF EXISTS idx_courier_service_categories;
DROP INDEX IF EXISTS idx_courier_online_location;
