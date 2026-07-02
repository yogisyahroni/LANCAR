-- +goose Up
-- Partial GIST index khusus untuk kurir yang sedang online dengan lokasi aktif.
-- Digunakan oleh query ST_DWithin pada SOS geo-radius broadcast agar tidak
-- full-scan seluruh tabel courier_profiles.
CREATE INDEX IF NOT EXISTS idx_courier_profiles_location_online
    ON courier_profiles USING GIST (current_location)
    WHERE is_online = true AND current_location IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_courier_profiles_location_online;
