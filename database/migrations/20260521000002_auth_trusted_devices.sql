-- +goose Up
CREATE TABLE IF NOT EXISTS auth_trusted_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_role VARCHAR(30) NOT NULL CHECK (
        user_role IN (
            'customer',
            'courier',
            'admin',
            'super_admin',
            'finance',
            'warehouse'
        )
    ),
    device_id_hash TEXT NOT NULL,
    device_label TEXT,
    device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    trusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, user_role, device_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_auth_trusted_devices_user_active
    ON auth_trusted_devices (user_id, user_role, revoked_at);

CREATE INDEX IF NOT EXISTS idx_auth_trusted_devices_hash
    ON auth_trusted_devices (device_id_hash);

-- +goose Down
DROP INDEX IF EXISTS idx_auth_trusted_devices_hash;
DROP INDEX IF EXISTS idx_auth_trusted_devices_user_active;
DROP TABLE IF EXISTS auth_trusted_devices;
