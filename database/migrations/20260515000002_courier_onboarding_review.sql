-- +goose Up
ALTER TABLE courier_profiles
  ADD COLUMN IF NOT EXISTS application_channel VARCHAR(30) NOT NULL DEFAULT 'on_demand',
  ADD COLUMN IF NOT EXISTS vehicle_brand VARCHAR(80),
  ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(80),
  ADD COLUMN IF NOT EXISTS vehicle_year INT,
  ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(30),
  ADD COLUMN IF NOT EXISTS onboarding_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);

-- +goose StatementBegin
DO $$ 
BEGIN
  -- try dropping and adding constraint
  ALTER TABLE courier_documents DROP CONSTRAINT IF EXISTS courier_documents_doc_type_check;
  ALTER TABLE courier_documents ADD CONSTRAINT courier_documents_doc_type_check CHECK (doc_type IN ('ktp','sim','stnk','skpd','selfie','skck','vehicle_photo','bank_account'));
EXCEPTION
  WHEN undefined_column THEN
    RAISE NOTICE 'Column doc_type does not exist, skipping constraint update';
END $$;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_courier_profiles_application_review
  ON courier_profiles(application_channel);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_profiles_application_review;

ALTER TABLE courier_documents
  DROP CONSTRAINT IF EXISTS courier_documents_doc_type_check,
  ADD CONSTRAINT courier_documents_doc_type_check
    CHECK (doc_type IN ('ktp','sim','stnk','selfie','skck','vehicle_photo'));

ALTER TABLE courier_profiles
  DROP COLUMN IF EXISTS application_channel,
  DROP COLUMN IF EXISTS vehicle_brand,
  DROP COLUMN IF EXISTS vehicle_model,
  DROP COLUMN IF EXISTS vehicle_year,
  DROP COLUMN IF EXISTS vehicle_category,
  DROP COLUMN IF EXISTS onboarding_checklist,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by;
