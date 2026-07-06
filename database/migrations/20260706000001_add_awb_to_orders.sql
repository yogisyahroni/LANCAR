-- +goose Up
ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb_number VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_orders_awb_number ON orders(awb_number);

-- +goose Down
DROP INDEX IF EXISTS idx_orders_awb_number;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_url;
ALTER TABLE orders DROP COLUMN IF EXISTS awb_number;
