-- +goose Up
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sequence_no INT;
CREATE INDEX IF NOT EXISTS idx_orders_sequence ON orders(sequence_no);

-- +goose Down
DROP INDEX IF EXISTS idx_orders_sequence;
ALTER TABLE orders DROP COLUMN IF EXISTS sequence_no;
