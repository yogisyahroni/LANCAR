-- +goose Up
-- +goose StatementBegin

ALTER TABLE courier_locations
  ADD COLUMN IF NOT EXISTS client_location_id TEXT,
  ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_courier_locations_client_replay
  ON courier_locations(courier_id, client_location_id, recorded_at DESC)
  WHERE client_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_courier_locations_device_replay
  ON courier_locations(device_id, recorded_at DESC)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trip_share_tokens_source
  ON trip_share_tokens((metadata->>'source'), created_at DESC)
  WHERE revoked_at IS NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_trip_share_tokens_source;
DROP INDEX IF EXISTS idx_courier_locations_device_replay;
DROP INDEX IF EXISTS idx_courier_locations_client_replay;

ALTER TABLE courier_locations
  DROP COLUMN IF EXISTS device_id,
  DROP COLUMN IF EXISTS client_location_id;

-- +goose StatementEnd
