-- Migration: Add discount and markup configuration to provider_configs
-- Date: 2026-07-06

BEGIN;

ALTER TABLE provider_configs
ADD COLUMN discount_pct NUMERIC(5,2) DEFAULT 0.00,
ADD COLUMN markup_pct NUMERIC(5,2) DEFAULT 0.00;

COMMIT;
