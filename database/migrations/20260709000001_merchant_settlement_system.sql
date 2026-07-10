-- +goose Up
-- ============================================================
-- MERCHANT ESCROW SETTLEMENT SYSTEM
-- Migration: 20260709000001
-- ============================================================

-- 1. Tabel utama: merchant_settlements
CREATE TABLE IF NOT EXISTS merchant_settlements (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_link_id      VARCHAR(20) NOT NULL REFERENCES payment_links(id),
    merchant_id          UUID NOT NULL,
    order_id             UUID NOT NULL,
    gross_item_price_idr INTEGER NOT NULL CHECK (gross_item_price_idr > 0),
    merchant_fee_idr     INTEGER NOT NULL CHECK (merchant_fee_idr >= 0),
    net_payout_idr       INTEGER NOT NULL CHECK (net_payout_idr >= 0),
    status               VARCHAR(30) NOT NULL DEFAULT 'HOLDING'
                             CHECK (status IN ('HOLDING','PROCESSING','COMPLETED','FAILED','DISPUTED')),
    idempotency_key      VARCHAR(100) NOT NULL,
    pod_confirmed_at     TIMESTAMPTZ,
    holding_release_at   TIMESTAMPTZ,
    settled_at           TIMESTAMPTZ,
    disbursement_ref     VARCHAR(100),
    failure_reason       TEXT,
    retry_count          INTEGER NOT NULL DEFAULT 0,
    metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_admin_id  UUID,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_settlements
    ADD CONSTRAINT IF NOT EXISTS uq_merchant_settlements_idempotency_key UNIQUE (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_merchant_settlements_cron
    ON merchant_settlements (status, holding_release_at)
    WHERE status = 'HOLDING';

CREATE INDEX IF NOT EXISTS idx_merchant_settlements_merchant_id
    ON merchant_settlements (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_settlements_order_id
    ON merchant_settlements (order_id);

-- 2. Bank account columns ke users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bank_code           VARCHAR(30),
    ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS bank_account_name   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS bank_verified       BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Delivery confirmation columns ke orders
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_pod_url       TEXT;

-- 4. Seed system_configs
INSERT INTO system_configs (key, value, description, category) VALUES
    ('merchant_settlement_holding_days', '1', 'Jumlah hari dana ditahan setelah POD sebelum dicairkan ke merchant', 'finance'),
    ('merchant_settlement_auto_enabled', 'true', 'Aktifkan auto-disbursement settlement ke merchant', 'finance'),
    ('merchant_settlement_max_retry', '3', 'Jumlah maksimal retry jika disbursement gagal', 'finance'),
    ('merchant_settlement_retry_delay_hours', '1', 'Jeda jam antar retry disbursement yang gagal', 'finance')
ON CONFLICT (key) DO NOTHING;

-- 5. Auto-update trigger
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION update_merchant_settlements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_merchant_settlements_updated_at ON merchant_settlements;
CREATE TRIGGER trg_merchant_settlements_updated_at
    BEFORE UPDATE ON merchant_settlements
    FOR EACH ROW
    EXECUTE FUNCTION update_merchant_settlements_updated_at();

-- +goose Down
DROP TRIGGER IF EXISTS trg_merchant_settlements_updated_at ON merchant_settlements;
DROP FUNCTION IF EXISTS update_merchant_settlements_updated_at();

DELETE FROM system_configs WHERE key IN (
    'merchant_settlement_holding_days',
    'merchant_settlement_auto_enabled',
    'merchant_settlement_max_retry',
    'merchant_settlement_retry_delay_hours'
);

ALTER TABLE orders
    DROP COLUMN IF EXISTS delivery_confirmed_at,
    DROP COLUMN IF EXISTS delivery_pod_url;

ALTER TABLE users
    DROP COLUMN IF EXISTS bank_code,
    DROP COLUMN IF EXISTS bank_account_number,
    DROP COLUMN IF EXISTS bank_account_name,
    DROP COLUMN IF EXISTS bank_verified;

DROP TABLE IF EXISTS merchant_settlements;
