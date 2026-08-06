-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-008: Wallet Hold Balance (payment-service)
-- Saldo hold/deposit driver sebagai jaminan anti-ghosting.
-- Self-funding dari revenue (bukan bakar modal).
-- ============================================================

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS hold_balance BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_minimum_required BIGINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE wallets
  DROP COLUMN IF EXISTS hold_balance,
  DROP COLUMN IF EXISTS hold_minimum_required;
