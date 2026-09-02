-- +goose Up
CREATE TABLE IF NOT EXISTS handoff_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage VARCHAR(20) NOT NULL CHECK (stage IN ('pickup', 'delivery')),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'consumed', 'expired', 'blocked', 'revoked')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_tokens_order_stage
    ON handoff_tokens(order_id, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handoff_tokens_active_expiry
    ON handoff_tokens(status, expires_at)
    WHERE status = 'active';

-- +goose Down
DROP INDEX IF EXISTS idx_handoff_tokens_active_expiry;
DROP INDEX IF EXISTS idx_handoff_tokens_order_stage;
DROP TABLE IF EXISTS handoff_tokens;
