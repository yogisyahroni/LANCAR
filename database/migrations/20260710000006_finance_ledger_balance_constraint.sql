-- +goose Up
-- ============================================================
-- LANCAR — Finance Ledger Balance Constraint
-- Migration: 20260710000006_finance_ledger_balance_constraint.sql
-- ============================================================

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_debit BIGINT;
    total_credit BIGINT;
BEGIN
    SELECT COALESCE(SUM(debit_idr), 0), COALESCE(SUM(credit_idr), 0)
    INTO total_debit, total_credit
    FROM ledger_entries
    WHERE journal_id = NEW.journal_id;

    IF total_debit <> total_credit THEN
        RAISE EXCEPTION 'Journal % is unbalanced: Debit = %, Credit = %', NEW.journal_id, total_debit, total_credit;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE CONSTRAINT TRIGGER trg_check_journal_balance
AFTER INSERT OR UPDATE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_journal_balance();

-- +goose Down
DROP TRIGGER IF EXISTS trg_check_journal_balance ON ledger_entries;
DROP FUNCTION IF EXISTS check_journal_balance;
