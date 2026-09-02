-- +goose Up
-- Durable AWB attempt and first-mile handoff state for aggregator orders.
CREATE TABLE IF NOT EXISTS aggregator_awb_attempts (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id),
    idempotency_key VARCHAR(160) NOT NULL UNIQUE,
    provider VARCHAR(40) NOT NULL,
    first_mile_mode VARCHAR(32) NOT NULL CHECK (first_mile_mode IN ('lancar_pickup', 'provider_pickup', 'customer_dropoff')),
    status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'created', 'failed')),
    awb_number VARCHAR(100),
    tracking_url TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_aggregator_awb_attempts_provider_awb
    ON aggregator_awb_attempts (provider, awb_number)
    WHERE awb_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS carrier_handoffs (
    id UUID PRIMARY KEY,
    awb_attempt_id UUID NOT NULL REFERENCES aggregator_awb_attempts(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    provider VARCHAR(40) NOT NULL,
    awb_number VARCHAR(100) NOT NULL,
    first_mile_mode VARCHAR(32) NOT NULL CHECK (first_mile_mode IN ('lancar_pickup', 'provider_pickup', 'customer_dropoff')),
    status VARCHAR(16) NOT NULL CHECK (status IN ('recorded', 'accepted', 'rejected')),
    handed_off_at TIMESTAMPTZ NOT NULL,
    location_lat NUMERIC(10,7),
    location_lng NUMERIC(10,7),
    location_address TEXT,
    evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    actor_id UUID NOT NULL,
    actor_type VARCHAR(32) NOT NULL,
    provider_ref VARCHAR(160),
    provider_accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (awb_attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_carrier_handoffs_order_id ON carrier_handoffs (order_id);
CREATE INDEX IF NOT EXISTS idx_carrier_handoffs_provider_awb ON carrier_handoffs (provider, awb_number);

INSERT INTO system_configs (key, value, description, category) VALUES
    ('awb_jne_first_mile_modes', '["lancar_pickup","provider_pickup","customer_dropoff"]', 'First-mile modes explicitly supported by JNE integration.', 'awb'),
    ('awb_jne_first_mile_mode', '"lancar_pickup"', 'Default JNE first-mile mode; must be one of the configured capabilities.', 'awb'),
    ('awb_jnt_first_mile_modes', '["lancar_pickup","provider_pickup","customer_dropoff"]', 'First-mile modes explicitly supported by J&T integration.', 'awb'),
    ('awb_jnt_first_mile_mode', '"lancar_pickup"', 'Default J&T first-mile mode; must be one of the configured capabilities.', 'awb')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs WHERE key IN (
    'awb_jne_first_mile_modes', 'awb_jne_first_mile_mode',
    'awb_jnt_first_mile_modes', 'awb_jnt_first_mile_mode'
);
DROP TABLE IF EXISTS carrier_handoffs;
DROP TABLE IF EXISTS aggregator_awb_attempts;
