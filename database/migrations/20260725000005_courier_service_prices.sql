-- +goose Up
-- ============================================================
-- LANCAR — Tambal Ban & Towing: Courier Service Prices
-- Migration: 20260725000005_courier_service_prices.sql
-- ============================================================

-- Each courier sets their own service price per service type
CREATE TABLE IF NOT EXISTS courier_service_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_id UUID NOT NULL REFERENCES courier_profiles(id),
    service_code VARCHAR(50) NOT NULL,
    
    -- Harga jasa yang ditentukan kurir (Rp)
    price_amount BIGINT NOT NULL CHECK (price_amount >= 0),
    
    -- Admin bisa set bounds
    min_price BIGINT DEFAULT 0,
    max_price BIGINT DEFAULT 999999,
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(courier_id, service_code)
);

-- Index for price lookups during customer search
CREATE INDEX IF NOT EXISTS idx_courier_service_prices_lookup 
    ON courier_service_prices(courier_id, service_code, is_active)
    WHERE is_active = TRUE;

-- +goose Down
DROP TABLE IF EXISTS courier_service_prices;
