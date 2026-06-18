-- +goose Up
ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_image_url VARCHAR(255);

-- +goose Down
ALTER TABLE orders DROP COLUMN IF EXISTS item_image_url;
