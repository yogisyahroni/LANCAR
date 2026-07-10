-- +goose Up
-- ============================================================
-- LANCAR — Phase 5: Aggregator Logistics Finance Schema
-- Migration: 20260711000007_phase5_aggregator_finance.sql
-- ============================================================

-- 1. AGG-001: Support pickup/dropoff surcharge in provider tariff cards
ALTER TABLE provider_tariff_cards
    ADD COLUMN IF NOT EXISTS pickup_surcharge_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dropoff_surcharge_idr BIGINT DEFAULT 0;

-- 2. AGG-002: Support platform markup/handling fee, quote expiry, quote hash in orders
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS platform_handling_fee_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_quote_expiry TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_quote_hash VARCHAR(128);

-- 3. AGG-003: Provider Invoice Reconciliation Tables
CREATE TABLE IF NOT EXISTS provider_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    provider_name VARCHAR(100) NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    total_claimed_idr BIGINT NOT NULL DEFAULT 0,
    total_matched_idr BIGINT NOT NULL DEFAULT 0,
    total_discrepancy_idr BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_RECONCILIATION', -- PENDING_RECONCILIATION, RECONCILED, APPROVED, DISPUTED, PAID
    notes TEXT,
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_invoices_provider_status ON provider_invoices(provider_name, status);

CREATE TABLE IF NOT EXISTS provider_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES provider_invoices(id) ON DELETE CASCADE,
    awb_number VARCHAR(100) NOT NULL,
    order_id UUID,
    claimed_amount_idr BIGINT NOT NULL,
    expected_net_cost_idr BIGINT NOT NULL DEFAULT 0,
    discrepancy_idr BIGINT NOT NULL DEFAULT 0,
    discrepancy_type VARCHAR(50) NOT NULL, -- MATCHED, OVERCHARGE, UNDERCHARGE, MISSING_AWB, DUPLICATE_BILLING
    resolution_status VARCHAR(50) NOT NULL DEFAULT 'UNRESOLVED', -- UNRESOLVED, ACCEPTED, DISPUTED_WITH_PROVIDER
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_invoice_items_invoice ON provider_invoice_items(invoice_id);
CREATE INDEX idx_provider_invoice_items_awb ON provider_invoice_items(awb_number);

-- 4. AGG-004: Merchant Settlement Ledger Entries Table
CREATE TABLE IF NOT EXISTS merchant_settlement_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID,
    merchant_id UUID NOT NULL,
    order_id UUID,
    journal_id UUID,
    entry_type VARCHAR(50) NOT NULL, -- CUSTOMER_PAYMENT, MERCHANT_PAYABLE, PLATFORM_HANDLING_FEE, TAX_PAYABLE, SETTLEMENT_RELEASE, SETTLEMENT_FAILED, DISPUTED_HOLD
    amount_idr BIGINT NOT NULL DEFAULT 0,
    fee_idr BIGINT NOT NULL DEFAULT 0,
    tax_idr BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'POSTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchant_settlement_ledger_merchant ON merchant_settlement_ledger_entries(merchant_id, entry_type);

-- 5. AGG-005: Return, Failed Delivery, Claim Policies & Records
CREATE TABLE IF NOT EXISTS logistics_exception_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code VARCHAR(100) NOT NULL UNIQUE,
    policy_name VARCHAR(150) NOT NULL,
    exception_type VARCHAR(50) NOT NULL, -- RETURN, FAILED_DELIVERY, LOST_CLAIM, DAMAGED_CLAIM
    provider_name VARCHAR(100) NOT NULL DEFAULT 'ALL',
    fee_borne_by VARCHAR(50) NOT NULL DEFAULT 'MERCHANT', -- MERCHANT, CUSTOMER, PLATFORM, PROVIDER
    fee_amount_idr BIGINT NOT NULL DEFAULT 0,
    fee_pct_order NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    config_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logistics_exception_policies_type ON logistics_exception_policies(exception_type, is_active);

CREATE TABLE IF NOT EXISTS logistics_exception_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    awb_number VARCHAR(100) NOT NULL,
    exception_type VARCHAR(50) NOT NULL, -- RETURN, FAILED_DELIVERY, LOST_CLAIM, DAMAGED_CLAIM
    provider_name VARCHAR(100) NOT NULL,
    claim_amount_idr BIGINT NOT NULL DEFAULT 0,
    provider_payout_idr BIGINT NOT NULL DEFAULT 0,
    customer_compensation_idr BIGINT NOT NULL DEFAULT 0,
    merchant_compensation_idr BIGINT NOT NULL DEFAULT 0,
    ledger_journal_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED', -- SUBMITTED, APPROVED, REJECTED, PAID, COMPENSATED
    notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logistics_exception_claims_order ON logistics_exception_claims(order_id);

-- Seed dynamic default policies
INSERT INTO logistics_exception_policies (
    policy_code, policy_name, exception_type, provider_name, fee_borne_by, fee_amount_idr, fee_pct_order, is_active
) VALUES
('RET-STD-001', 'Standard Return Fee Policy (50% Order Freight or Fixed)', 'RETURN', 'ALL', 'MERCHANT', 10000, 50.00, true),
('FAIL-STD-001', 'Failed Delivery Attempt Policy', 'FAILED_DELIVERY', 'ALL', 'MERCHANT', 5000, 0.00, true),
('CLAIM-LOST-001', 'Lost Shipment Provider Insurance Claim', 'LOST_CLAIM', 'ALL', 'PROVIDER', 0, 100.00, true),
('CLAIM-DMG-001', 'Damaged Shipment Provider Insurance Claim', 'DAMAGED_CLAIM', 'ALL', 'PROVIDER', 0, 100.00, true)
ON CONFLICT (policy_code) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS logistics_exception_claims;
DROP TABLE IF EXISTS logistics_exception_policies;
DROP TABLE IF EXISTS merchant_settlement_ledger_entries;
DROP TABLE IF EXISTS provider_invoice_items;
DROP TABLE IF EXISTS provider_invoices;

ALTER TABLE orders
    DROP COLUMN IF EXISTS provider_quote_hash,
    DROP COLUMN IF EXISTS provider_quote_expiry,
    DROP COLUMN IF EXISTS platform_handling_fee_idr;

ALTER TABLE provider_tariff_cards
    DROP COLUMN IF EXISTS dropoff_surcharge_idr,
    DROP COLUMN IF EXISTS pickup_surcharge_idr;
