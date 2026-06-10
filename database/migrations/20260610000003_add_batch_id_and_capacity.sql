-- +goose Up
-- Add batch_id to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_orders_batch ON orders(batch_id);

-- Add batch_id to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_payments_batch ON payments(batch_id);

-- Add capacity configurations to courier_profiles
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS max_weight_capacity_kg DECIMAL(5,2) DEFAULT 20.00;
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS max_packages_capacity INT DEFAULT 5;

-- +goose Down
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS max_packages_capacity;
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS max_weight_capacity_kg;

DROP INDEX IF EXISTS idx_payments_batch;
ALTER TABLE payments DROP COLUMN IF EXISTS batch_id;

DROP INDEX IF EXISTS idx_orders_batch;
ALTER TABLE orders DROP COLUMN IF EXISTS batch_id;
