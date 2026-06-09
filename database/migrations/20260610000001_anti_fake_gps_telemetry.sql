-- +goose NO TRANSACTION
-- +goose Up
-- Anti-Fake GPS Telemetry Columns
-- Stores client-side risk assessment data for each GPS sample.
-- Enables server-side behavioral analysis and graduated response enforcement.

ALTER TABLE courier_gps_logs
    ADD COLUMN IF NOT EXISTS risk_score REAL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'VALID',
    ADD COLUMN IF NOT EXISTS mock_setting_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS developer_options BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS usb_debugging BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS fake_gps_apps TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS accelerometer_ok BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS gyroscope_ok BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS barometer_ok BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS step_counter_ok BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS sensor_available BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS sensor_integrity BOOLEAN DEFAULT TRUE;

-- Partial index for querying suspicious/flagged GPS logs only.
-- Uses partial indexing (WHERE risk_level != 'VALID') to keep index size small
-- since the vast majority of rows will be VALID.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_courier_gps_logs_risk_level ON courier_gps_logs (risk_level)
    WHERE risk_level != 'VALID';

-- Index for time-windowed violation queries used by graduated response engine.
-- Covers queries like "count violations in last 24 hours for courier X".
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_courier_gps_logs_risk_courier_time ON courier_gps_logs (courier_id, recorded_at)
    WHERE risk_level IN ('SUSPICIOUS', 'FAKE_GPS_DETECTED');


-- +goose Down
DROP INDEX IF EXISTS idx_courier_gps_logs_risk_courier_time;
DROP INDEX IF EXISTS idx_courier_gps_logs_risk_level;

ALTER TABLE courier_gps_logs
    DROP COLUMN IF EXISTS risk_score,
    DROP COLUMN IF EXISTS risk_level,
    DROP COLUMN IF EXISTS mock_setting_enabled,
    DROP COLUMN IF EXISTS developer_options,
    DROP COLUMN IF EXISTS usb_debugging,
    DROP COLUMN IF EXISTS fake_gps_apps,
    DROP COLUMN IF EXISTS accelerometer_ok,
    DROP COLUMN IF EXISTS gyroscope_ok,
    DROP COLUMN IF EXISTS barometer_ok,
    DROP COLUMN IF EXISTS step_counter_ok,
    DROP COLUMN IF EXISTS sensor_available,
    DROP COLUMN IF EXISTS sensor_integrity;
