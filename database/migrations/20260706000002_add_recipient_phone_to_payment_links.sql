-- +goose Up
-- Tambahkan nomor HP konsignee ke payment_links
-- untuk keperluan broadcast WhatsApp setelah link dibuat.
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(30);
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS recipient_name  VARCHAR(200);

-- +goose Down
ALTER TABLE payment_links DROP COLUMN IF EXISTS recipient_name;
ALTER TABLE payment_links DROP COLUMN IF EXISTS recipient_phone;
