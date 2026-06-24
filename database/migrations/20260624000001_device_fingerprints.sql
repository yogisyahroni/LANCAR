-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS device_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id_hash VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    browser_fingerprint VARCHAR(255),
    risk_score INT DEFAULT 0,
    is_blocked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_device_fingerprints_hash ON device_fingerprints(device_id_hash);
CREATE INDEX idx_device_fingerprints_user_id ON device_fingerprints(user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS device_fingerprints;
-- +goose StatementEnd
