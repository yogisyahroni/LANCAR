-- +goose Up
-- ============================================================
-- LANCAR — Tambal Ban & Towing: Service Reports
-- Migration: 20260725000007_tambalban_reports.sql
-- ============================================================

-- Tambal Ban service reports (before/after photos, service details)
CREATE TABLE IF NOT EXISTS tambal_ban_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    courier_id UUID NOT NULL REFERENCES courier_profiles(id),
    
    -- Inspection (before)
    tire_condition_before VARCHAR(50), -- bocor, pecah, aus
    tire_photo_before_url TEXT,
    
    -- Service details
    service_duration_minutes INT,
    materials_used TEXT, -- jenis tambal, alat
    notes TEXT,
    
    -- Inspection (after)
    tire_condition_after VARCHAR(50),
    tire_photo_after_url TEXT,
    
    -- Completion
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tambal_ban_reports_order 
    ON tambal_ban_reports(order_id);

-- Towing service reports (before/after photos, loading/unloading)
CREATE TABLE IF NOT EXISTS towing_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    courier_id UUID NOT NULL REFERENCES courier_profiles(id),
    
    -- Inspection (before pickup)
    vehicle_condition_before TEXT, -- bisa jalan, rem, dll
    vehicle_photo_before_url TEXT,
    odometer_reading INT,
    
    -- Loading
    loading_photo_url TEXT,
    loading_started_at TIMESTAMPTZ,
    
    -- Transit
    transit_started_at TIMESTAMPTZ,
    transit_ended_at TIMESTAMPTZ,
    
    -- Unloading
    unloading_photo_url TEXT,
    unloading_completed_at TIMESTAMPTZ,
    odometer_after INT,
    
    -- Completion
    completion_photo_url TEXT, -- foto bersama customer
    signature_url TEXT, -- tanda tangan digital
    completed_at TIMESTAMPTZ,
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_towing_reports_order 
    ON towing_reports(order_id);

-- +goose Down
DROP TABLE IF EXISTS towing_reports;
DROP TABLE IF EXISTS tambal_ban_reports;
