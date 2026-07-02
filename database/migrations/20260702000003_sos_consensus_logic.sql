-- +goose Up
ALTER TABLE courier_sos_helpers
ADD COLUMN IF NOT EXISTS verdict VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Also update courier_sos_incidents check constraint if one existed, but it's a varchar, so it's fine.
-- Adding 'DISPUTED' as a valid status application logic side.

-- +goose Down
ALTER TABLE courier_sos_helpers
DROP COLUMN IF EXISTS verdict,
DROP COLUMN IF EXISTS photo_url,
DROP COLUMN IF EXISTS reported_at;
