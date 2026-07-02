-- +goose Up
-- Partial GIST index khusus untuk kurir yang sedang online dengan lokasi aktif.
-- Digunakan oleh query ST_DWithin pada SOS geo-radius broadcast agar tidak
-- full-scan seluruh tabel courier_profiles.
CREATE INDEX IF NOT EXISTS idx_courier_profiles_location_online
    ON courier_profiles USING GIST (current_location)
    WHERE is_online = true AND current_location IS NOT NULL;

-- Pastikan tabel user_devices sudah ada di shared database.
-- Tabel ini dibuat oleh admin-service (migrations/004_user_devices.sql).
-- Migration ini hanya mendokumentasikan dependensinya dan menambah index tambahan
-- untuk query FCM bulk-lookup yang digunakan oleh SOS broadcast.
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id_active
    ON user_devices (user_id)
    WHERE last_active_at > NOW() - INTERVAL '30 days';

-- +goose Down
DROP INDEX IF EXISTS idx_courier_profiles_location_online;
DROP INDEX IF EXISTS idx_user_devices_user_id_active;
