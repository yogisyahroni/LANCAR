-- +goose Up
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_city VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_zip_code VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dropoff_city VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dropoff_zip_code VARCHAR(20);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS pickup_city VARCHAR(255);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS pickup_zip_code VARCHAR(20);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS dropoff_city VARCHAR(255);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS dropoff_zip_code VARCHAR(20);

-- +goose Down
ALTER TABLE payment_links DROP COLUMN IF EXISTS dropoff_zip_code;
ALTER TABLE payment_links DROP COLUMN IF EXISTS dropoff_city;
ALTER TABLE payment_links DROP COLUMN IF EXISTS pickup_zip_code;
ALTER TABLE payment_links DROP COLUMN IF EXISTS pickup_city;
ALTER TABLE orders DROP COLUMN IF EXISTS dropoff_zip_code;
ALTER TABLE orders DROP COLUMN IF EXISTS dropoff_city;
ALTER TABLE orders DROP COLUMN IF EXISTS pickup_zip_code;
ALTER TABLE orders DROP COLUMN IF EXISTS pickup_city;
