-- +goose Up
ALTER TABLE delivery_service_products 
ADD COLUMN IF NOT EXISTS extra_dropoff_fee_idr INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE delivery_service_products
DROP COLUMN IF EXISTS extra_dropoff_fee_idr;
