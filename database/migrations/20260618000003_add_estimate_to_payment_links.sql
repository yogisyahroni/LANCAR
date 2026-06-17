ALTER TABLE payment_links ADD COLUMN estimate_id character varying(255);
ALTER TABLE payment_links ADD COLUMN pickup_address text;
ALTER TABLE payment_links ADD COLUMN pickup_lat double precision;
ALTER TABLE payment_links ADD COLUMN pickup_lng double precision;
ALTER TABLE payment_links ADD COLUMN delivery_fee_amount bigint DEFAULT 0;
