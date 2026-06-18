-- +goose Up
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS service_code VARCHAR(50);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS order_id VARCHAR(50);

-- +goose Down
ALTER TABLE payment_links DROP COLUMN IF EXISTS service_code;
ALTER TABLE payment_links DROP COLUMN IF EXISTS order_id;
