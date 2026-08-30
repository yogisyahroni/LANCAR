-- +goose Up
-- ZIP menu editor needs a persisted description for menu cards and detail forms.
ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS deskripsi TEXT NULL;

-- +goose Down
ALTER TABLE merchant_menu_items
  DROP COLUMN IF EXISTS deskripsi;
