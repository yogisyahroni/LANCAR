-- +goose Up
-- ============================================================
-- LANCAR — Finance Ledger System (Append-Only)
-- Migration: 20260710000002_finance_ledger_system.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS ledger_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_type VARCHAR(50) NOT NULL, -- payment, refund, wallet_topup, wallet_withdraw, courier_payout, merchant_settlement, provider_invoice, tax, promo, adjustment
    reference_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    reason TEXT,
    metadata JSONB,
    created_by VARCHAR(100),
    actor_role VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ledger_journals_ref ON ledger_journals (reference_type, reference_id);
CREATE INDEX idx_ledger_journals_type ON ledger_journals (journal_type);
CREATE INDEX idx_ledger_journals_created_at ON ledger_journals (created_at);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL REFERENCES ledger_journals(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL, -- cash_main, cash_tax, customer_wallet_liability, courier_payable, platform_fee_revenue, dll
    debit_idr BIGINT NOT NULL DEFAULT 0,
    credit_idr BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_positive_amounts CHECK (debit_idr >= 0 AND credit_idr >= 0),
    CONSTRAINT chk_not_both_zero CHECK (debit_idr > 0 OR credit_idr > 0)
);

CREATE INDEX idx_ledger_entries_account ON ledger_entries (account_name);
CREATE INDEX idx_ledger_entries_journal ON ledger_entries (journal_id);
CREATE INDEX idx_ledger_entries_created_at ON ledger_entries (created_at);

-- Trigger to prevent UPDATE or DELETE on ledger tables (Append-Only rule)
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger is append-only. UPDATE and DELETE are strictly forbidden. Use reversal journals for corrections.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_ledger_journals_mutation
BEFORE UPDATE OR DELETE ON ledger_journals
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER trg_prevent_ledger_entries_mutation
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- +goose Down
DROP TRIGGER IF EXISTS trg_prevent_ledger_entries_mutation ON ledger_entries;
DROP TRIGGER IF EXISTS trg_prevent_ledger_journals_mutation ON ledger_journals;
DROP FUNCTION IF EXISTS prevent_ledger_mutation;
DROP TABLE IF EXISTS ledger_entries;
DROP TABLE IF EXISTS ledger_journals;
