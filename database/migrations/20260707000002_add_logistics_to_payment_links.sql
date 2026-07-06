-- +goose Up
-- Tambahkan kolom logistics_provider dan logistics_service_type ke payment_links
-- untuk menghubungkan payment link ke penyedia 3PL yang dipilih merchant.
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS logistics_provider VARCHAR(20);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS logistics_service_type VARCHAR(30);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS store_name VARCHAR(200);

-- +goose Down
ALTER TABLE payment_links DROP COLUMN IF EXISTS store_name;
ALTER TABLE payment_links DROP COLUMN IF EXISTS logistics_service_type;
ALTER TABLE payment_links DROP COLUMN IF EXISTS logistics_provider;
