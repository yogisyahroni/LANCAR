-- +goose Up
-- Raw-first carrier event inbox. Provider-native fields remain queryable even
-- when canonical mapping or order lookup is unavailable.
CREATE TABLE IF NOT EXISTS carrier_event_inbox (
    id UUID PRIMARY KEY,
    provider VARCHAR(40) NOT NULL,
    event_id VARCHAR(200) NOT NULL,
    payload_hash VARCHAR(128) NOT NULL,
    awb_number VARCHAR(100) NOT NULL,
    canonical_status VARCHAR(64) NOT NULL,
    raw_status VARCHAR(160) NOT NULL,
    raw_code VARCHAR(160),
    raw_description TEXT,
    raw_location TEXT,
    occurred_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, event_id),
    UNIQUE (provider, payload_hash)
);
CREATE INDEX IF NOT EXISTS idx_carrier_event_inbox_awb_received
    ON carrier_event_inbox (awb_number, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_carrier_event_inbox_unknown
    ON carrier_event_inbox (canonical_status) WHERE canonical_status = 'UNKNOWN';

-- +goose Down
DROP TABLE IF EXISTS carrier_event_inbox;
