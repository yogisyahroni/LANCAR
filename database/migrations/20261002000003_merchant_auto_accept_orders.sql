-- +goose Up
-- Server-authoritative merchant preference for immediately accepting paid food orders.
ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS auto_accept_orders BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE merchants
    DROP COLUMN IF EXISTS auto_accept_orders;
