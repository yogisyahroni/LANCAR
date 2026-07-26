-- +goose Up
-- ============================================================
-- LANCAR — Tambal Ban & Towing: Settlement Configs
-- Migration: 20260725000006_settlement_configs.sql
-- ============================================================

-- Settlement configuration per service type
-- Model A: Pool Commission (Ondemand/Regular)
-- Model B: Per-KM Commission (Tambal Ban & Towing)
CREATE TABLE IF NOT EXISTS settlement_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code VARCHAR(50) NOT NULL UNIQUE,
    service_category VARCHAR(50) NOT NULL,
    
    -- Commission basis: "pool" (Model A) atau "per_km" (Model B)
    commission_basis VARCHAR(20) NOT NULL DEFAULT 'pool'
        CHECK (commission_basis IN ('pool', 'per_km')),
    
    -- Commission percentage
    platform_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    
    -- MDR & PPN (dibayar customer, bukan dari kurir)
    mdr_pct DECIMAL(5,2) NOT NULL DEFAULT 2.90,
    tax_pct DECIMAL(5,2) NOT NULL DEFAULT 11.00,
    
    -- What courier keeps 100%
    courier_keeps_service_fee BOOLEAN DEFAULT TRUE,
    courier_keeps_base_fee BOOLEAN DEFAULT TRUE,
    courier_keeps_toll BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed settlement configs
INSERT INTO settlement_configs 
    (service_code, service_category, commission_basis, platform_commission_pct, 
     courier_keeps_service_fee, courier_keeps_base_fee, courier_keeps_toll)
VALUES
    -- Model A: Pool Commission
    ('on_demand', 'on_demand', 'pool', 20.00, TRUE, TRUE, TRUE),
    ('regular', 'regular', 'pool', 20.00, TRUE, TRUE, TRUE),
    
    -- Model B: Per-KM Commission
    ('tambal_ban_motor', 'tambal_ban', 'per_km', 20.00, TRUE, FALSE, TRUE),
    ('tambal_ban_mobil', 'tambal_ban', 'per_km', 20.00, TRUE, FALSE, TRUE),
    ('towing_motor', 'towing', 'per_km', 20.00, TRUE, FALSE, TRUE),
    ('towing_mobil', 'towing', 'per_km', 20.00, TRUE, FALSE, TRUE)
ON CONFLICT (service_code) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS settlement_configs;
