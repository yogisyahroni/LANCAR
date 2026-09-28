-- +goose Up
-- LANCAR — Admin-managed provider discovery timeout for every delivery service.
-- The matching worker and customer tracking API read this value from the service catalog.

ALTER TABLE delivery_service_products
  ADD COLUMN IF NOT EXISTS provider_search_timeout_minutes INTEGER NOT NULL DEFAULT 10;

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_service_products_provider_search_timeout_minutes_check'
  ) THEN
    ALTER TABLE delivery_service_products
      ADD CONSTRAINT delivery_service_products_provider_search_timeout_minutes_check
      CHECK (provider_search_timeout_minutes BETWEEN 1 AND 1440);
  END IF;
END $$;
-- +goose StatementEnd

UPDATE delivery_service_products
SET provider_search_timeout_minutes = CASE
  WHEN service_category = 'tambal_ban' THEN 15
  WHEN service_category = 'towing' THEN 30
  ELSE 10
END,
updated_at = NOW();

-- +goose Down
ALTER TABLE delivery_service_products
  DROP CONSTRAINT IF EXISTS delivery_service_products_provider_search_timeout_minutes_check;

ALTER TABLE delivery_service_products
  DROP COLUMN IF EXISTS provider_search_timeout_minutes;
