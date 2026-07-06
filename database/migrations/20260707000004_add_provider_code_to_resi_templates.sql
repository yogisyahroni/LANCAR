-- +goose Up
ALTER TABLE resi_templates ADD COLUMN provider_code VARCHAR(50);
-- +goose Down
ALTER TABLE resi_templates DROP COLUMN provider_code;