-- +goose Up
-- LANCAR: Add missing updated_at column to courier_face_verifications.
-- The reviewFaceVerification handler does SET updated_at = NOW() but the
-- original table definition (20260602000012) only has created_at.

ALTER TABLE courier_face_verifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill existing rows using created_at as a safe baseline
UPDATE courier_face_verifications
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE courier_face_verifications
  ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_courier_face_verifications_status_updated
  ON courier_face_verifications(status, updated_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_face_verifications_status_updated;
ALTER TABLE courier_face_verifications DROP COLUMN IF EXISTS updated_at;
