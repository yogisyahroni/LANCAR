-- +goose Up
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS estimate_id character varying(255);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS pickup_address text;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS pickup_lat double precision;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS pickup_lng double precision;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS delivery_fee_amount bigint DEFAULT 0;

-- +goose Down
ALTER TABLE payment_links DROP COLUMN IF EXISTS estimate_id;
ALTER TABLE payment_links DROP COLUMN IF EXISTS pickup_address;
ALTER TABLE payment_links DROP COLUMN IF EXISTS pickup_lat;
ALTER TABLE payment_links DROP COLUMN IF EXISTS pickup_lng;
ALTER TABLE payment_links DROP COLUMN IF EXISTS delivery_fee_amount;
