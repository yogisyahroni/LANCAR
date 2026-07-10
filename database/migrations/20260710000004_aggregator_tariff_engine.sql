-- +goose Up
-- ============================================================
-- LANCAR — Aggregator Tariff Engine
-- Migration: 20260710000004_aggregator_tariff_engine.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_tariff_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name VARCHAR(100) NOT NULL,
    service_code VARCHAR(50) NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    volumetric_divisor INT NOT NULL DEFAULT 6000,
    min_weight_kg NUMERIC(6,2) NOT NULL DEFAULT 1.0,
    fuel_surcharge_pct NUMERIC(5,2) DEFAULT 0,
    remote_area_surcharge_idr BIGINT DEFAULT 0,
    insurance_fee_pct NUMERIC(5,2) DEFAULT 0,
    insurance_min_fee_idr BIGINT DEFAULT 0,
    return_fee_pct NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_tariff_cards_provider ON provider_tariff_cards(provider_name, service_code);

CREATE TABLE IF NOT EXISTS provider_tariff_lanes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES provider_tariff_cards(id) ON DELETE CASCADE,
    origin_zone VARCHAR(100) NOT NULL,
    destination_zone VARCHAR(100) NOT NULL,
    base_rate_idr BIGINT NOT NULL DEFAULT 0,
    per_kg_rate_idr BIGINT NOT NULL DEFAULT 0,
    sla_min_days INT,
    sla_max_days INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_tariff_lanes_zones ON provider_tariff_lanes(origin_zone, destination_zone);

CREATE TABLE IF NOT EXISTS provider_tariff_weight_brackets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES provider_tariff_cards(id) ON DELETE CASCADE,
    min_weight_kg NUMERIC(6,2) NOT NULL,
    max_weight_kg NUMERIC(6,2) NOT NULL,
    fixed_price_idr BIGINT,
    per_kg_price_idr BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Aggregator Provider Cost Snapshot in Orders
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS provider_gross_tariff_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_discount_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_net_cost_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS customer_shipping_charge_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS chosen_provider VARCHAR(100),
    ADD COLUMN IF NOT EXISTS chosen_service VARCHAR(50);

-- +goose Down
ALTER TABLE orders
    DROP COLUMN IF EXISTS chosen_service,
    DROP COLUMN IF EXISTS chosen_provider,
    DROP COLUMN IF EXISTS customer_shipping_charge_idr,
    DROP COLUMN IF EXISTS provider_net_cost_idr,
    DROP COLUMN IF EXISTS provider_discount_idr,
    DROP COLUMN IF EXISTS provider_gross_tariff_idr;

DROP TABLE IF EXISTS provider_tariff_weight_brackets;
DROP TABLE IF EXISTS provider_tariff_lanes;
DROP TABLE IF EXISTS provider_tariff_cards;
