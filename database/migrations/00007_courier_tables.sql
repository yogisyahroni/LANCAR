-- +goose Up
-- Migration 00007: Courier Tables extension
-- NOTE: courier_profiles dan courier_documents sudah dibuat di 00001_init_schema.sql
-- Migration ini hanya memastikan kolom tambahan ada (idempotent via IF NOT EXISTS)
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS current_zone_id UUID;

CREATE INDEX IF NOT EXISTS idx_courier_profiles_user_id ON courier_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_courier_profiles_verification_status ON courier_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_courier_documents_courier_id ON courier_documents(courier_id);

-- +goose Down
-- Note: tidak di-drop karena 00001 yang create tablenya
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS current_zone_id;
