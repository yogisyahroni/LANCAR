-- +goose Up
ALTER TABLE orders ADD COLUMN IF NOT EXISTS package_details JSONB;

-- +goose Down
ALTER TABLE orders DROP COLUMN IF EXISTS package_details;
