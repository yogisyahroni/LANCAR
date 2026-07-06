-- +goose Up
-- Phase A4: Add discount and markup columns to logistics_providers
ALTER TABLE logistics_providers ADD COLUMN IF NOT EXISTS discount_pct DECIMAL(5,2) DEFAULT 0;
ALTER TABLE logistics_providers ADD COLUMN IF NOT EXISTS markup_pct DECIMAL(5,2) DEFAULT 0;
ALTER TABLE logistics_providers ADD COLUMN IF NOT EXISTS discount_notes TEXT;

-- Phase A5: Add logistics pricing and provider choice columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS logistics_provider VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS logistics_service_type VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS logistics_tariff_idr BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS logistics_net_cost_idr BIGINT;

-- Phase A6: Add unique AWB sender name to users for unique seller requirement
ALTER TABLE users ADD COLUMN IF NOT EXISTS awb_sender_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS awb_sender_code VARCHAR(50);

-- Make awb_sender_name unique via index (idempotent, no PL/pgSQL needed)
CREATE UNIQUE INDEX IF NOT EXISTS unique_awb_sender_name ON users(awb_sender_name) WHERE awb_sender_name IS NOT NULL;

-- +goose Down
-- Revert Phase A6
DROP INDEX IF EXISTS unique_awb_sender_name;
ALTER TABLE users DROP COLUMN IF EXISTS awb_sender_code;
ALTER TABLE users DROP COLUMN IF EXISTS awb_sender_name;

-- Revert Phase A5
ALTER TABLE orders DROP COLUMN IF EXISTS logistics_net_cost_idr;
ALTER TABLE orders DROP COLUMN IF EXISTS logistics_tariff_idr;
ALTER TABLE orders DROP COLUMN IF EXISTS logistics_service_type;
ALTER TABLE orders DROP COLUMN IF EXISTS logistics_provider;

-- Revert Phase A4
ALTER TABLE logistics_providers DROP COLUMN IF EXISTS discount_notes;
ALTER TABLE logistics_providers DROP COLUMN IF EXISTS markup_pct;
ALTER TABLE logistics_providers DROP COLUMN IF EXISTS discount_pct;
