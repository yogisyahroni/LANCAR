-- +goose Up
-- Add platform_fee_idr and platform_fee_pct to delivery_service_products table
ALTER TABLE delivery_service_products 
ADD COLUMN platform_fee_idr INTEGER NOT NULL DEFAULT 1500,
ADD COLUMN platform_fee_pct NUMERIC(5,4) NOT NULL DEFAULT 0.0150;

-- +goose Down
-- Remove platform_fee columns
ALTER TABLE delivery_service_products 
DROP COLUMN IF EXISTS platform_fee_idr,
DROP COLUMN IF EXISTS platform_fee_pct;
