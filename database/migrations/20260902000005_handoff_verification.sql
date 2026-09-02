-- +goose Up
-- CORE-2026-006: One-time proof verification tokens (OTP/PIN/QR/signature)
-- and proof requirement matrix per service/stage.

CREATE TABLE IF NOT EXISTS proof_verification_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    actor_id        UUID NOT NULL,
    actor_role      VARCHAR(40) NOT NULL,
    stage           VARCHAR(50) NOT NULL,
    service_category VARCHAR(40) NOT NULL,
    -- The one-time token (OTP code, QR token, or PIN digest).
    -- Stored as a hash so a DB read does not reveal valid credentials.
    token_hash       VARCHAR(255) NOT NULL,
    -- Salt for the hash; generated per-token.
    token_salt       VARCHAR(64)  NOT NULL,
    -- Token format: 'numeric_6' (OTP PIN), 'alphanumeric', 'qr'.
    token_format     VARCHAR(32)  NOT NULL,
    -- Expiration timestamp.
    expires_at       TIMESTAMPTZ NOT NULL,
    -- Current attempt count.
    attempts         INTEGER      NOT NULL DEFAULT 0,
    -- Max attempts before the token is permanently invalidated.
    max_attempts     INTEGER      NOT NULL DEFAULT 3,
    -- NULL when unused; set when the token is consumed.
    used_at          TIMESTAMPTZ,
    used_by          UUID,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_tokens_order_stage
    ON proof_verification_tokens (order_id, stage)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_proof_tokens_order
    ON proof_verification_tokens (order_id);

CREATE INDEX IF NOT EXISTS idx_proof_tokens_expires
    ON proof_verification_tokens (expires_at);

-- Proof requirement matrix: which stages require which proof per service.
-- This makes the requirement matrix data-driven instead of hardcoded.
CREATE TABLE IF NOT EXISTS proof_requirements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_category VARCHAR(40) NOT NULL,
    stage           VARCHAR(50) NOT NULL,
    proof_type      VARCHAR(50) NOT NULL, -- 'otp', 'qr', 'signature', 'photo', 'pin'
    required        BOOLEAN NOT NULL DEFAULT true,
    -- NULL = no expiry for the requirement itself (token expiry is runtime config)
    min_value       INTEGER,
    max_value       INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (service_category, stage, proof_type)
);

-- Seed canonical proof requirements per CORE-2026-006:
-- package_on_demand: delivery requires otp/qr/signature + photo
-- food: delivery requires signature/photo
-- tambal_ban: pickup and delivery require photo (before/after)
-- towing: loading/unloading require photo + signature
INSERT INTO proof_requirements (service_category, stage, proof_type, required) VALUES
    ('package_on_demand', 'pickup',        'photo',     true),
    ('package_on_demand', 'delivering',    'otp',       true),
    ('package_on_demand', 'delivering',    'qr',        true),
    ('package_on_demand', 'delivering',    'signature', true),
    ('package_on_demand', 'delivering',    'photo',     true),
    ('food',              'picked_up',     'photo',     true),
    ('food',              'delivering',    'signature', true),
    ('food',              'delivering',    'photo',     true),
    ('tambal_ban',        'pickup',        'photo',     true),
    ('tambal_ban',        'delivered',     'photo',     true),
    ('tambal_ban',        'delivered',     'signature', true),
    ('towing',            'loading',       'photo',     true),
    ('towing',            'loading',       'signature', true),
    ('towing',            'unloading',     'photo',     true),
    ('towing',            'unloading',     'signature', true)
ON CONFLICT (service_category, stage, proof_type) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS proof_requirements;
DROP TABLE IF EXISTS proof_verification_tokens;
