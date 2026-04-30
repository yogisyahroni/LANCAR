-- +goose Up
CREATE TABLE otp_logs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number  VARCHAR(20) NOT NULL,
    code          VARCHAR(10) NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    is_used       BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_phone_code ON otp_logs(phone_number, code);
CREATE INDEX idx_otp_expires ON otp_logs(expires_at);

-- +goose Down
DROP TABLE IF EXISTS otp_logs;
