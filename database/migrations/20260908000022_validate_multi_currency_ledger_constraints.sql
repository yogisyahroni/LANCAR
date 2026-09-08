-- +goose Up
-- GLOB-2026-002: validate ledger checks after the append-only backfill
-- migration has committed. PostgreSQL cannot validate a table constraint in
-- the same transaction that still has pending foreign-key trigger events.
ALTER TABLE ledger_journals VALIDATE CONSTRAINT ledger_journals_currency_code_ck;
ALTER TABLE ledger_journals VALIDATE CONSTRAINT ledger_journals_currency_minor_unit_ck;
ALTER TABLE ledger_entries VALIDATE CONSTRAINT ledger_entries_currency_code_ck;
ALTER TABLE ledger_entries VALIDATE CONSTRAINT ledger_entries_currency_minor_unit_ck;
ALTER TABLE ledger_entries VALIDATE CONSTRAINT ledger_entries_currency_amounts_ck;

-- +goose Down
-- The constraints are owned by 20260908000021 and are removed when that
-- migration is rolled back. This migration only changes validation state.
SELECT 1;
