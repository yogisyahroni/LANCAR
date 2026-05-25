-- +goose Up
ALTER TABLE pricing_configs
  ADD COLUMN IF NOT EXISTS price_per_min INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS weather_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS traffic_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1.00;

-- +goose Down
ALTER TABLE pricing_configs
  DROP COLUMN IF EXISTS traffic_multiplier,
  DROP COLUMN IF EXISTS weather_multiplier,
  DROP COLUMN IF EXISTS surge_enabled,
  DROP COLUMN IF EXISTS price_per_min;
