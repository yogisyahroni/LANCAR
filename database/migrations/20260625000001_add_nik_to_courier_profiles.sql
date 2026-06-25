-- 20260625000001_add_nik_to_courier_profiles.sql
-- Adds missing fields from the courier registration form (Android) to the DB schema

-- +goose Up
ALTER TABLE courier_profiles
ADD COLUMN IF NOT EXISTS nik VARCHAR(20),
ADD COLUMN IF NOT EXISTS engine_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS sim_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS skpd_tax_active BOOLEAN DEFAULT false;

-- +goose Down
ALTER TABLE courier_profiles
DROP COLUMN IF EXISTS nik,
DROP COLUMN IF EXISTS engine_type,
DROP COLUMN IF EXISTS sim_active,
DROP COLUMN IF EXISTS skpd_tax_active;
