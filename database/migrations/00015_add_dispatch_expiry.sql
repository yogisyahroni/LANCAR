-- +goose Up
ALTER TABLE orders ADD COLUMN dispatch_expiry TIMESTAMP;

-- +goose Down
ALTER TABLE orders DROP COLUMN dispatch_expiry;
