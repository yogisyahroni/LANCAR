-- +goose Up
-- ============================================================
-- LANCAR — Payment Tax Snapshot
-- Migration: 20260711000001_payment_tax_snapshot.sql
-- ============================================================

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS tax_rule_code VARCHAR(50) REFERENCES tax_rules(code),
    ADD COLUMN IF NOT EXISTS ppn_rate_effective_pct NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS ppn_rate_statutory_pct NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS dpp_idr BIGINT,
    ADD COLUMN IF NOT EXISTS tax_invoice_required BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tax_invoice_status VARCHAR(20) DEFAULT 'unissued';

-- +goose Down
ALTER TABLE payments
    DROP COLUMN IF EXISTS tax_invoice_status,
    DROP COLUMN IF EXISTS tax_invoice_required,
    DROP COLUMN IF EXISTS dpp_idr,
    DROP COLUMN IF EXISTS ppn_rate_statutory_pct,
    DROP COLUMN IF EXISTS ppn_rate_effective_pct,
    DROP COLUMN IF EXISTS tax_rule_code;
