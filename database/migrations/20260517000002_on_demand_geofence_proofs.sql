-- +goose Up
-- +goose StatementBegin
ALTER TABLE package_scans
  ADD COLUMN IF NOT EXISTS scan_type VARCHAR(50) NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_accuracy_m DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_package_scans_scan_type ON package_scans(scan_type);
CREATE INDEX IF NOT EXISTS idx_package_scans_recorded ON package_scans(order_id, scanned_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_package_scans_recorded;
DROP INDEX IF EXISTS idx_package_scans_scan_type;
ALTER TABLE package_scans
  DROP COLUMN IF EXISTS location_accuracy_m,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS photo_url,
  DROP COLUMN IF EXISTS scan_type;
-- +goose StatementEnd
