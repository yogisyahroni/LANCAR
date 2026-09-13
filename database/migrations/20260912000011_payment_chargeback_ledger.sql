-- +goose Up
-- Chargeback outcome evidence is an immutable financial sub-ledger. It records
-- the provider outcome and liability owner; settlement posting remains owned
-- by the finance ledger and must use a compensating entry.
CREATE TABLE IF NOT EXISTS payment_chargeback_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chargeback_id UUID NOT NULL REFERENCES payment_chargebacks(id),
    intent_id UUID NOT NULL REFERENCES payment_intents(id),
    entry_type VARCHAR(16) NOT NULL CHECK (entry_type IN ('LOSS','WIN')),
    liability_owner VARCHAR(24) NOT NULL CHECK (liability_owner IN ('MERCHANT','PLATFORM','SHARED')),
    provider_case_reference VARCHAR(255) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (chargeback_id, entry_type)
);
CREATE INDEX IF NOT EXISTS idx_payment_chargeback_ledger_intent
    ON payment_chargeback_ledger_entries(intent_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_payment_chargeback_ledger_immutable ON payment_chargeback_ledger_entries;
CREATE TRIGGER trg_payment_chargeback_ledger_immutable BEFORE UPDATE OR DELETE ON payment_chargeback_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_platform_financial_history_update();

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_chargeback_ledger_entries LIMIT 1) THEN
    RAISE EXCEPTION 'chargeback ledger history exists; use a reviewed compensating migration';
  END IF;
END $$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS trg_payment_chargeback_ledger_immutable ON payment_chargeback_ledger_entries;
DROP TABLE IF EXISTS payment_chargeback_ledger_entries;
