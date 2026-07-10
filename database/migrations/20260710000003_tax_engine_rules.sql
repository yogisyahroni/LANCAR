-- +goose Up
-- ============================================================
-- LANCAR — Tax Engine & Orders/Payments Upgrade (BIGINT)
-- Migration: 20260710000003_tax_engine_rules.sql
-- ============================================================

-- 1. Upgrade Monetary columns in orders and payments to BIGINT
ALTER TABLE orders 
    ALTER COLUMN base_price_idr TYPE BIGINT,
    ALTER COLUMN volumetric_surcharge_idr TYPE BIGINT,
    ALTER COLUMN weight_surcharge_idr TYPE BIGINT,
    ALTER COLUMN dynamic_price_idr TYPE BIGINT,
    ALTER COLUMN loyalty_discount_idr TYPE BIGINT,
    ALTER COLUMN insurance_premium_idr TYPE BIGINT,
    ALTER COLUMN total_price_idr TYPE BIGINT,
    ALTER COLUMN ppn_idr TYPE BIGINT,
    ALTER COLUMN mdr_idr TYPE BIGINT,
    ALTER COLUMN insured_value_idr TYPE BIGINT;

ALTER TABLE payments
    ALTER COLUMN amount_idr TYPE BIGINT,
    ALTER COLUMN mdr_amount_idr TYPE BIGINT,
    ALTER COLUMN ppn_amount_idr TYPE BIGINT,
    ALTER COLUMN weather_reserve_idr TYPE BIGINT,
    ALTER COLUMN insurance_reserve_idr TYPE BIGINT,
    ALTER COLUMN net_operational_idr TYPE BIGINT;

-- 2. Create Tax Rules Table
CREATE TABLE IF NOT EXISTS tax_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g. PPN_11, PPN_12, PPH_21, PPH_23
    name VARCHAR(100) NOT NULL,
    tax_type VARCHAR(20) NOT NULL, -- PPN, PPH, OTHER
    effective_rate_pct NUMERIC(5,2) NOT NULL,
    statutory_rate_pct NUMERIC(5,2) NOT NULL,
    dpp_formula VARCHAR(100) NOT NULL, -- 'FULL', 'SERVICE_FEE_ONLY', 'COMMISSION_ONLY'
    invoice_required BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tax_rules_type ON tax_rules(tax_type);
CREATE INDEX idx_tax_rules_effective ON tax_rules(effective_from, effective_to);

-- 3. Add Tax Snapshot & Price Components to Orders
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS tax_rule_code VARCHAR(50) REFERENCES tax_rules(code),
    ADD COLUMN IF NOT EXISTS ppn_rate_effective_pct NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS ppn_rate_statutory_pct NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS dpp_idr BIGINT,
    ADD COLUMN IF NOT EXISTS tax_invoice_required BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tax_invoice_status VARCHAR(20) DEFAULT 'unissued', -- unissued, draft, exported, submitted, accepted, rejected
    ADD COLUMN IF NOT EXISTS platform_fee_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS promo_subsidy_idr BIGINT DEFAULT 0;

-- 4. Create eFaktur Export Table
CREATE TABLE IF NOT EXISTS tax_efaktur_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_period VARCHAR(10) NOT NULL, -- YYYY-MM
    export_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    total_dpp_idr BIGINT NOT NULL DEFAULT 0,
    total_ppn_idr BIGINT NOT NULL DEFAULT 0,
    exported_by VARCHAR(100),
    file_path TEXT,
    checksum VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tax_efaktur_exports_period ON tax_efaktur_exports(tax_period);

-- +goose Down
DROP TABLE IF EXISTS tax_efaktur_exports;

ALTER TABLE orders
    DROP COLUMN IF EXISTS promo_subsidy_idr,
    DROP COLUMN IF EXISTS platform_fee_pct,
    DROP COLUMN IF EXISTS platform_fee_idr,
    DROP COLUMN IF EXISTS tax_invoice_status,
    DROP COLUMN IF EXISTS tax_invoice_required,
    DROP COLUMN IF EXISTS dpp_idr,
    DROP COLUMN IF EXISTS ppn_rate_statutory_pct,
    DROP COLUMN IF EXISTS ppn_rate_effective_pct,
    DROP COLUMN IF EXISTS tax_rule_code;

DROP TABLE IF EXISTS tax_rules;

ALTER TABLE payments
    ALTER COLUMN amount_idr TYPE INT,
    ALTER COLUMN mdr_amount_idr TYPE INT,
    ALTER COLUMN ppn_amount_idr TYPE INT,
    ALTER COLUMN weather_reserve_idr TYPE INT,
    ALTER COLUMN insurance_reserve_idr TYPE INT,
    ALTER COLUMN net_operational_idr TYPE INT;

ALTER TABLE orders 
    ALTER COLUMN base_price_idr TYPE INT,
    ALTER COLUMN volumetric_surcharge_idr TYPE INT,
    ALTER COLUMN weight_surcharge_idr TYPE INT,
    ALTER COLUMN dynamic_price_idr TYPE INT,
    ALTER COLUMN loyalty_discount_idr TYPE INT,
    ALTER COLUMN insurance_premium_idr TYPE INT,
    ALTER COLUMN total_price_idr TYPE INT,
    ALTER COLUMN ppn_idr TYPE INT,
    ALTER COLUMN mdr_idr TYPE INT,
    ALTER COLUMN insured_value_idr TYPE INT;
