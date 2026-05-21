-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'payments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%provider%'
  LOOP
    EXECUTE format('ALTER TABLE payments DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE payments
  ADD CONSTRAINT payments_provider_supported_check
  CHECK (provider IN ('midtrans', 'xendit', 'lapay'));

CREATE TABLE IF NOT EXISTS customer_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_wallets_customer_status
  ON customer_wallets(customer_id, status);

CREATE TABLE IF NOT EXISTS customer_wallet_ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES customer_wallets(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  entry_type VARCHAR(40) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
  balance_after_idr BIGINT NOT NULL CHECK (balance_after_idr >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_customer_created
  ON customer_wallet_ledger_entries(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_order
  ON customer_wallet_ledger_entries(order_id)
  WHERE order_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_customer_wallet_ledger_order;
DROP INDEX IF EXISTS idx_customer_wallet_ledger_customer_created;
DROP TABLE IF EXISTS customer_wallet_ledger_entries;
DROP INDEX IF EXISTS idx_customer_wallets_customer_status;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_provider_supported_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_provider_supported_check
  CHECK (provider IN ('midtrans', 'xendit'));
-- +goose StatementEnd
