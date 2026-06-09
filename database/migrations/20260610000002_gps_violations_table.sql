-- +goose Up
-- Graduated Response: GPS Violation Events Table
-- Stores audit trail of all anti-fake GPS violations for graduated enforcement.
-- Each row represents a single detected violation with telemetry context.

CREATE TABLE IF NOT EXISTS courier_gps_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_id UUID NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
    risk_score REAL NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL DEFAULT 'SUSPICIOUS',
    action_taken TEXT NOT NULL DEFAULT 'WARNING',
    latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
    longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
    device_id TEXT NOT NULL DEFAULT '',

    -- Telemetry details for forensic analysis
    fake_gps_apps TEXT[] DEFAULT '{}',
    developer_options BOOLEAN DEFAULT FALSE,
    mock_setting_enabled BOOLEAN DEFAULT FALSE,
    sensor_integrity BOOLEAN DEFAULT TRUE,
    accelerometer_ok BOOLEAN DEFAULT TRUE,
    gyroscope_ok BOOLEAN DEFAULT TRUE,
    barometer_ok BOOLEAN DEFAULT TRUE,
    step_counter_ok BOOLEAN DEFAULT TRUE,
    is_rooted BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for graduated response engine: count violations per courier per time window
CREATE INDEX IF NOT EXISTS idx_courier_gps_violations_courier_time
    ON courier_gps_violations (courier_id, created_at DESC);

-- Index for admin dashboard: filter by action taken
CREATE INDEX IF NOT EXISTS idx_courier_gps_violations_action
    ON courier_gps_violations (action_taken)
    WHERE action_taken != 'WARNING';

-- Index for risk level filtering
CREATE INDEX IF NOT EXISTS idx_courier_gps_violations_risk
    ON courier_gps_violations (risk_level, created_at DESC);

COMMENT ON TABLE courier_gps_violations IS 'Audit trail for anti-fake GPS violations. Each row records a single detection event with telemetry context, risk assessment, and enforcement action taken.';
COMMENT ON COLUMN courier_gps_violations.risk_level IS 'VALID, SUSPICIOUS, or FAKE_GPS_DETECTED';
COMMENT ON COLUMN courier_gps_violations.action_taken IS 'NONE, WARNING, TEMP_SUSPEND_1H, TEMP_SUSPEND_24H, or MANUAL_REVIEW';


-- +goose Down
DROP TABLE IF EXISTS courier_gps_violations;
