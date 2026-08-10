-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-023/024: kolom hold di wallet courier & customer
-- Kolom ini DIPAKAI payment-service (domain/wallet.go, wallet_service.go
-- UpdateHold/DeductFromHold, repository postgres_repository.go) tapi belum
-- pernah dibuat di schema — query runtime akan gagal
-- "column hold_balance does not exist" tanpa migrasi ini.
-- ============================================================

-- customer_wallets: kurang hold_balance, hold_minimum_required, version
ALTER TABLE customer_wallets
  ADD COLUMN IF NOT EXISTS hold_balance BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_minimum_required BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- courier_wallets: kurang hold_balance, hold_minimum_required (version sudah ada)
ALTER TABLE courier_wallets
  ADD COLUMN IF NOT EXISTS hold_balance BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_minimum_required BIGINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE customer_wallets
  DROP COLUMN IF EXISTS hold_balance,
  DROP COLUMN IF EXISTS hold_minimum_required,
  DROP COLUMN IF EXISTS version;

ALTER TABLE courier_wallets
  DROP COLUMN IF EXISTS hold_balance,
  DROP COLUMN IF EXISTS hold_minimum_required;
