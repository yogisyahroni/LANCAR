-- +goose Up
-- ============================================================
-- Migration 00016: Sprint 4 Missing Tables
-- LANCAR Hyperlocal Relay Platform
-- ============================================================

-- -------------------------------------------------------
-- Refunds: track order refunds
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS refunds (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL REFERENCES orders(id),
    payment_id          UUID REFERENCES payments(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    amount_idr          INT NOT NULL,
    reason              TEXT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
    refund_percentage   INT NOT NULL, -- 100 or 80
    gateway_ref         VARCHAR(255),
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_order ON refunds(order_id);
CREATE INDEX idx_refunds_user ON refunds(user_id);
CREATE INDEX idx_refunds_status ON refunds(status);

-- +goose Down
DROP TABLE IF EXISTS refunds;
