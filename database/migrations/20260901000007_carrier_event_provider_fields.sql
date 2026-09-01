-- +goose Up
-- Keep provider-native values explicit and queryable. The raw_* columns remain
-- for backward compatibility with events written before this contract.
ALTER TABLE carrier_event_inbox
    ADD COLUMN IF NOT EXISTS provider_status VARCHAR(160) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS provider_status_code VARCHAR(160),
    ADD COLUMN IF NOT EXISTS provider_status_description TEXT,
    ADD COLUMN IF NOT EXISTS provider_location TEXT,
    ADD COLUMN IF NOT EXISTS provider_timestamp TEXT;

UPDATE carrier_event_inbox
SET provider_status = COALESCE(NULLIF(provider_status, ''), raw_status),
    provider_status_code = COALESCE(provider_status_code, raw_code),
    provider_status_description = COALESCE(provider_status_description, raw_description),
    provider_location = COALESCE(provider_location, raw_location),
    provider_timestamp = COALESCE(provider_timestamp, occurred_at::text)
WHERE provider_status = ''
   OR provider_status_code IS NULL
   OR provider_status_description IS NULL
   OR provider_location IS NULL
   OR provider_timestamp IS NULL;

CREATE INDEX IF NOT EXISTS idx_carrier_event_inbox_provider_status
    ON carrier_event_inbox (provider, provider_status, received_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_carrier_event_inbox_provider_status;
ALTER TABLE carrier_event_inbox
    DROP COLUMN IF EXISTS provider_timestamp,
    DROP COLUMN IF EXISTS provider_location,
    DROP COLUMN IF EXISTS provider_status_description,
    DROP COLUMN IF EXISTS provider_status_code,
    DROP COLUMN IF EXISTS provider_status;
