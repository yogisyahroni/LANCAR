-- +goose Up
-- Add priority multiplier for helpers (expires after 24 hours usually)
ALTER TABLE courier_profiles
ADD COLUMN priority_multiplier_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create an index to quickly find couriers with active priority multipliers
CREATE INDEX IF NOT EXISTS idx_courier_profiles_priority_until ON courier_profiles (priority_multiplier_until);

-- Create table to record SOS incidents
CREATE TABLE IF NOT EXISTS courier_sos_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    victim_courier_id UUID NOT NULL REFERENCES courier_profiles(id),
    helper_courier_id UUID REFERENCES courier_profiles(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'broadcasted', -- broadcasted, accepted, resolved_real, resolved_fake
    resolution_photo_url TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sos_victim ON courier_sos_incidents(victim_courier_id);
CREATE INDEX IF NOT EXISTS idx_sos_helper ON courier_sos_incidents(helper_courier_id);

-- +goose Down
DROP TABLE IF EXISTS courier_sos_incidents;

DROP INDEX IF EXISTS idx_courier_profiles_priority_until;
ALTER TABLE courier_profiles
DROP COLUMN priority_multiplier_until;
