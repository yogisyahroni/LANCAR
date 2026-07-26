-- +goose Up
-- ============================================================
-- LANCAR — Tambal Ban & Towing: Courier Availability State
-- Migration: 20260725000004_courier_availability_state.sql
-- ============================================================

-- Courier availability state machine for real-time tracking
CREATE TABLE IF NOT EXISTS courier_availability_state (
    courier_id UUID PRIMARY KEY REFERENCES courier_profiles(id),
    
    current_state VARCHAR(30) NOT NULL DEFAULT 'idle'
        CHECK (current_state IN (
            'idle', 
            'navigating_to_pickup', 
            'at_pickup', 
            'on_site', 
            'in_transit',
            'returning'
        )),
    
    active_order_id UUID REFERENCES orders(id),
    active_order_type VARCHAR(50),
    
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    last_location_update TIMESTAMPTZ DEFAULT NOW(),
    
    total_completed_today INT DEFAULT 0,
    avg_service_time_minutes INT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for availability lookups
CREATE INDEX IF NOT EXISTS idx_availability_state_courier 
    ON courier_availability_state(courier_id);

CREATE INDEX IF NOT EXISTS idx_availability_state_lookup 
    ON courier_availability_state(current_state, latitude, longitude)
    WHERE current_state != 'idle';

-- +goose Down
DROP TABLE IF EXISTS courier_availability_state;
