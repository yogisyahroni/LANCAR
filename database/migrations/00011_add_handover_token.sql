-- +goose Up
ALTER TABLE orders ADD COLUMN handover_token VARCHAR(100);
CREATE INDEX idx_orders_handover_token ON orders(handover_token);

-- +goose Down
DROP INDEX IF EXISTS idx_orders_handover_token;
ALTER TABLE orders DROP COLUMN handover_token;
