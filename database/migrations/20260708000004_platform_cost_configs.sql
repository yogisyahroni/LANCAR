-- +goose Up
-- ============================================================
-- Migration 20260708000004: Platform Cost Intelligence & Auto-Pricing
-- TEMBUS Hyperlocal Delivery Platform
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_cost_configs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_label        VARCHAR(20) NOT NULL,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'archived')),
    -- CAPEX (Amortisasi)
    capex_total_idr             BIGINT NOT NULL DEFAULT 0,
    capex_amort_months          INT NOT NULL DEFAULT 24,
    capex_monthly_idr           BIGINT GENERATED ALWAYS AS 
                                (capex_total_idr / NULLIF(capex_amort_months, 0)) STORED,
    -- OPEX Tetap (per bulan)
    opex_server_idr             BIGINT NOT NULL DEFAULT 0,
    opex_domain_ssl_idr         BIGINT NOT NULL DEFAULT 0,
    opex_marketing_idr          BIGINT NOT NULL DEFAULT 0,
    opex_team_salary_idr        BIGINT NOT NULL DEFAULT 0,
    opex_insurance_idr          BIGINT NOT NULL DEFAULT 0,
    opex_other_fixed_idr        BIGINT NOT NULL DEFAULT 0,
    -- OPEX Variabel (per order)
    opex_tomtom_per_order_idr   INT NOT NULL DEFAULT 0,
    opex_zenziva_per_order_idr  INT NOT NULL DEFAULT 0,
    -- Estimasi volume & target margin
    estimated_orders_per_month  INT NOT NULL DEFAULT 1000,
    target_margin_ondemand_pct  DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    target_margin_aggregator_pct DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    -- Metadata
    notes               TEXT,
    created_by          UUID REFERENCES users(id),
    approved_by         UUID REFERENCES users(id),
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_configs_period ON platform_cost_configs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_cost_configs_status ON platform_cost_configs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_configs_single_active 
    ON platform_cost_configs(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS pricing_recommendations (
    id                                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cost_config_id                          UUID NOT NULL REFERENCES platform_cost_configs(id) ON DELETE CASCADE,
    platform_cost_per_order_idr             BIGINT NOT NULL,
    ondemand_base_fee_recommended_idr       BIGINT NOT NULL,
    ondemand_per_km_fee_recommended_idr     BIGINT NOT NULL,
    ondemand_current_base_fee_idr           BIGINT,
    ondemand_current_per_km_fee_idr         BIGINT,
    aggregator_handling_fee_recommended_idr BIGINT NOT NULL,
    aggregator_margin_pct_recommended       DECIMAL(5,2) NOT NULL,
    aggregator_current_handling_fee_idr     BIGINT,
    status                                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                                            CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
    rejection_reason                        TEXT,
    generated_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by                             UUID REFERENCES users(id),
    reviewed_at                             TIMESTAMPTZ,
    applied_at                              TIMESTAMPTZ,
    applied_pricing_config_id               UUID REFERENCES pricing_configs(id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_rec_status ON pricing_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_pricing_rec_config ON pricing_recommendations(cost_config_id);

-- +goose Down
-- DROP TABLE IF EXISTS pricing_recommendations;
-- DROP TABLE IF EXISTS platform_cost_configs;
