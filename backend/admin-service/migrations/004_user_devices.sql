-- Migration: 004_user_devices
-- Description: Create table to store FCM device tokens for push notifications

CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token TEXT UNIQUE NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by user_id
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);

-- Index for cleaning up old tokens
CREATE INDEX idx_user_devices_last_active ON user_devices(last_active_at);

-- Add description for audit log
COMMENT ON TABLE user_devices IS 'Stores FCM registration tokens for mobile and web push notifications';
