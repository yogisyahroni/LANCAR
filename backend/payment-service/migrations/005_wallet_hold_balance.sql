-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-008: Wallet Hold Balance (payment-service)
-- Saldo hold/deposit driver sebagai jaminan anti-ghosting.
-- Self-funding dari revenue (bukan bakar modal).
--
-- FIX 2026-08-06: migration 002_separate_wallet_tables.sql sudah
-- DROP TABLE wallets dan menggantinya dengan customer_wallets +
-- courier_wallets. ALTER TABLE wallets di versi awal 005 akan
-- selalu gagal (relation does not exist). Hold balance hanya
-- relevan untuk driver (courier_wallets), tetapi kolom juga
-- ditambahkan ke customer_wallets agar SELECT repo tidak perlu
-- branch per role.
-- ============================================================

ALTER TABLE customer_wallets
  ADD COLUMN IF NOT EXISTS hold_balance BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_minimum_required BIGINT NOT NULL DEFAULT 0;

ALTER TABLE courier_wallets
  ADD COLUMN IF NOT EXISTS hold_balance BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_minimum_required BIGINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE customer_wallets
  DROP COLUMN IF EXISTS hold_balance,
  DROP COLUMN IF EXISTS hold_minimum_required;

ALTER TABLE courier_wallets
  DROP COLUMN IF EXISTS hold_balance,
  DROP COLUMN IF EXISTS hold_minimum_required;
