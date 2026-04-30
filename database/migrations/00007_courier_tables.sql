-- Migration: Add Courier Tables
CREATE TABLE IF NOT EXISTS courier_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    current_zone_id UUID,
    status TEXT NOT NULL DEFAULT 'pending',
    relay_score DOUBLE PRECISION DEFAULT 100.0,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS courier_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL, -- ktp, sim, stnk, selfie
    document_url TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courier_profiles_user_id ON courier_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_courier_profiles_status ON courier_profiles(status);
CREATE INDEX IF NOT EXISTS idx_courier_documents_courier_id ON courier_documents(courier_id);
