-- +goose Up
ALTER TABLE pricing_configs
  ADD COLUMN IF NOT EXISTS volumetric_div INT;

UPDATE pricing_configs
SET volumetric_div = 6000
WHERE volumetric_div IS NULL
   OR volumetric_div <= 0;

ALTER TABLE pricing_configs
  ALTER COLUMN volumetric_div SET DEFAULT 6000,
  ALTER COLUMN volumetric_div SET NOT NULL;

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pricing_configs_volumetric_div_positive'
  ) THEN
    ALTER TABLE pricing_configs
      ADD CONSTRAINT pricing_configs_volumetric_div_positive
      CHECK (volumetric_div > 0);
  END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE pricing_configs
  DROP CONSTRAINT IF EXISTS pricing_configs_volumetric_div_positive,
  DROP COLUMN IF EXISTS volumetric_div;
