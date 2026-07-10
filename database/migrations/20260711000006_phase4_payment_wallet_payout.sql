-- +goose Up
-- Phase 4: Payment, Wallet, Refund & Payout End-to-End Remediation
-- PAY-001 to PAY-005

-- 1. Universal Idempotency Records Table (PAY-001)
CREATE TABLE IF NOT EXISTS universal_idempotency_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) NOT NULL,
    operation_type VARCHAR(50) NOT NULL, -- create_payment, wallet_topup, deposit_webhook, refund, withdraw, courier_payout, merchant_settlement
    request_hash VARCHAR(64) NOT NULL,
    response_hash VARCHAR(64) NOT NULL,
    response_code INT NOT NULL DEFAULT 200,
    response_payload JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    CONSTRAINT uq_idempotency_key_operation UNIQUE (idempotency_key, operation_type)
);

CREATE INDEX IF NOT EXISTS idx_universal_idempotency_key ON universal_idempotency_records(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_universal_idempotency_expires ON universal_idempotency_records(expires_at);

-- 2. Wallet Reconciliation Logs Table (PAY-002)
CREATE TABLE IF NOT EXISTS wallet_reconciliation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_type VARCHAR(50) NOT NULL, -- customer, courier, merchant
    wallet_id UUID NOT NULL,
    wallet_balance_idr BIGINT NOT NULL DEFAULT 0,
    ledger_sum_idr BIGINT NOT NULL DEFAULT 0,
    mismatch_idr BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'matched', -- matched, mismatched, repaired
    adjustment_journal_id UUID REFERENCES ledger_journals(id),
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_wallet_reconcile_status ON wallet_reconciliation_logs(status);
CREATE INDEX IF NOT EXISTS idx_wallet_reconcile_wallet ON wallet_reconciliation_logs(wallet_id);

-- 3. Enhance refunds table for Accounting & Reversal Tracking (PAY-003)
ALTER TABLE refunds
    ALTER COLUMN amount_idr TYPE BIGINT,
    ADD COLUMN IF NOT EXISTS tax_reversal_idr BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS platform_fee_reversal_idr BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ledger_journal_id UUID REFERENCES ledger_journals(id),
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 4. Dynamic Disbursement Channel Configs Table (PAY-005)
CREATE TABLE IF NOT EXISTS disbursement_channel_configs (
    channel_code VARCHAR(50) PRIMARY KEY,
    channel_name VARCHAR(100) NOT NULL,
    provider_fee_idr BIGINT NOT NULL DEFAULT 0,
    user_fee_idr BIGINT NOT NULL DEFAULT 0,
    platform_borne_fee_idr BIGINT NOT NULL DEFAULT 0,
    min_amount_idr BIGINT NOT NULL DEFAULT 10000,
    max_amount_idr BIGINT NOT NULL DEFAULT 250000000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Configurable Channels (PAY-005)
INSERT INTO disbursement_channel_configs (
    channel_code, channel_name, provider_fee_idr, user_fee_idr, platform_borne_fee_idr, min_amount_idr, max_amount_idr, is_active, updated_at
) VALUES
    ('bifast', 'BI-FAST Realtime Bank Transfer', 2500, 0, 2500, 10000, 250000000, TRUE, NOW()),
    ('bank_transfer_rtgs', 'Bank Transfer RTGS/LLG', 15000, 15000, 0, 100000, 500000000, TRUE, NOW()),
    ('ewallet_gopay', 'GoPay Disbursement', 1500, 1500, 0, 10000, 20000000, TRUE, NOW()),
    ('ewallet_ovo', 'OVO Disbursement', 1500, 1500, 0, 10000, 20000000, TRUE, NOW()),
    ('ewallet_dana', 'DANA Disbursement', 1500, 1500, 0, 10000, 20000000, TRUE, NOW()),
    ('provider_default', 'Default Bank Transfer Provider', 2500, 0, 2500, 10000, 100000000, TRUE, NOW())
ON CONFLICT (channel_code) DO NOTHING;

-- 5. Seed Dynamic System Configs for Finance Policies
INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES
    ('disbursement_auto_process_threshold_idr', '5000000', 'Batas maksimum nominal disbursement otomatis tanpa manual review (IDR)', 'finance', NOW()),
    ('wallet_reconciliation_alert_threshold_idr', '1', 'Batas selisih minimum rekonsiliasi yang memicu alert keamanan (IDR)', 'finance', NOW()),
    ('courier_payout_fee_idr', '0', 'Biaya penarikan penghasilan kurir per transaksi (IDR)', 'finance', NOW()),
    ('max_instant_payout_idr', '10000000', 'Batas maksimal instant payout per hari untuk kurir (IDR)', 'finance', NOW())
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs WHERE key IN ('disbursement_auto_process_threshold_idr', 'wallet_reconciliation_alert_threshold_idr', 'courier_payout_fee_idr', 'max_instant_payout_idr');
DROP TABLE IF EXISTS disbursement_channel_configs;
ALTER TABLE refunds 
    DROP COLUMN IF EXISTS tax_reversal_idr,
    DROP COLUMN IF EXISTS platform_fee_reversal_idr,
    DROP COLUMN IF EXISTS ledger_journal_id,
    DROP COLUMN IF EXISTS failure_reason;
DROP TABLE IF EXISTS wallet_reconciliation_logs;
DROP TABLE IF EXISTS universal_idempotency_records;
