-- +goose Up
-- PAYPLAT-2026-010: timestamp-only order numbers collide under concurrent
-- customer checkout. The sequence is the uniqueness source; the timestamp is
-- retained only as a human-friendly prefix.
CREATE SEQUENCE IF NOT EXISTS customer_order_number_seq AS BIGINT START WITH 1;

-- +goose Down
DROP SEQUENCE IF EXISTS customer_order_number_seq;
