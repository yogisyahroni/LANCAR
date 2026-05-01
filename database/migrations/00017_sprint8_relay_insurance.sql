-- +goose Up
-- ============================================================
-- Migration 00017: Sprint 8 Relay & Insurance
-- ============================================================

-- -------------------------------------------------------
-- Order Insurance: premium and coverage per order
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_insurance (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    declared_value  INT NOT NULL,          -- Nilai barang yang diasuransikan (IDR)
    premium_fee     INT NOT NULL,          -- Premi yang dibayar customer (IDR)
    coverage_limit  INT NOT NULL,          -- Maksimal penggantian (IDR)
    status          VARCHAR(20) DEFAULT 'active', -- 'active' | 'claimed' | 'void'
    provider        VARCHAR(100) DEFAULT 'internal', -- 'internal' atau 'pasarpolis' dsb
    claim_id        VARCHAR(100),          -- Jika ada claim
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_order_insurance_order ON order_insurance(order_id);
CREATE INDEX idx_order_insurance_status ON order_insurance(status);

-- +goose Down
DROP TABLE IF EXISTS order_insurance;
