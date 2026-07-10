-- +goose Up
-- ============================================================
-- LANCAR — Remaining Phase 5 Aggregator Schema Extensions
-- Migration: 20260711000008_phase5_remaining_aggregator_schema.sql
-- ============================================================

ALTER TABLE provider_tariff_cards
    ADD COLUMN IF NOT EXISTS pickup_dropoff_surcharge_idr BIGINT DEFAULT 0;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS platform_handling_fee_idr BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quote_expiry TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS quote_response_hash VARCHAR(255);

-- +goose Down
ALTER TABLE orders
    DROP COLUMN IF EXISTS quote_response_hash,
    DROP COLUMN IF EXISTS quote_expiry,
    DROP COLUMN IF EXISTS platform_handling_fee_idr;

ALTER TABLE provider_tariff_cards
    DROP COLUMN IF EXISTS pickup_dropoff_surcharge_idr;
