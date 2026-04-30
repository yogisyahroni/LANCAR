-- +goose Up
-- Migration 00007: Courier Documents table + courier_profiles extensions
-- courier_profiles already exists from 00001_init_schema.sql
-- courier_documents is created here (was missing from init schema)

-- -------------------------------------------------------
-- courier_documents: KYC document storage per courier
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS courier_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id      UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
    doc_type        VARCHAR(30) NOT NULL CHECK (doc_type IN ('ktp','sim','stnk','selfie','skck','vehicle_photo')),
    file_url        TEXT NOT NULL,
    is_verified     BOOLEAN DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    verified_by     UUID REFERENCES users(id),
    rejection_note  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- Extend courier_profiles with additional columns
-- -------------------------------------------------------
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS current_zone_id UUID;

-- -------------------------------------------------------
-- Indexes
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_courier_profiles_user_id
    ON courier_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_courier_profiles_verification_status
    ON courier_profiles(verification_status);

CREATE INDEX IF NOT EXISTS idx_courier_documents_courier_id
    ON courier_documents(courier_id);

CREATE INDEX IF NOT EXISTS idx_courier_documents_type
    ON courier_documents(courier_id, doc_type);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_documents_type;
DROP INDEX IF EXISTS idx_courier_documents_courier_id;
DROP INDEX IF EXISTS idx_courier_profiles_verification_status;
DROP INDEX IF EXISTS idx_courier_profiles_user_id;
DROP TABLE IF EXISTS courier_documents;
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS current_zone_id;
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS verified_at;
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS is_verified;
