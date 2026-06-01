-- +goose Up
-- +goose StatementBegin
ALTER TABLE customer_wallets
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE customer_wallets
  ALTER COLUMN balance TYPE NUMERIC(14,2)
  USING balance::NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_customer_wallets_customer_id
  ON customer_wallets(customer_id);

CREATE TABLE IF NOT EXISTS courier_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_wallets_courier_id
  ON courier_wallets(courier_id);

CREATE INDEX IF NOT EXISTS idx_courier_wallets_courier_status
  ON courier_wallets(courier_id, status);

CREATE TABLE IF NOT EXISTS customer_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES customer_wallets(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL,
  reference_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_transactions_wallet_created
  ON customer_wallet_transactions(wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_transactions_reference
  ON customer_wallet_transactions(reference_id)
  WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS courier_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES courier_wallets(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL,
  reference_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_wallet_transactions_wallet_created
  ON courier_wallet_transactions(wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_wallet_transactions_reference
  ON courier_wallet_transactions(reference_id)
  WHERE reference_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_courier_wallet_transactions_reference;
DROP INDEX IF EXISTS idx_courier_wallet_transactions_wallet_created;
DROP TABLE IF EXISTS courier_wallet_transactions;

DROP INDEX IF EXISTS idx_customer_wallet_transactions_reference;
DROP INDEX IF EXISTS idx_customer_wallet_transactions_wallet_created;
DROP TABLE IF EXISTS customer_wallet_transactions;

DROP INDEX IF EXISTS idx_courier_wallets_courier_status;
DROP INDEX IF EXISTS idx_courier_wallets_courier_id;
DROP TABLE IF EXISTS courier_wallets;

DROP INDEX IF EXISTS idx_customer_wallets_customer_id;

ALTER TABLE customer_wallets
  ALTER COLUMN balance TYPE BIGINT
  USING ROUND(balance)::BIGINT;

ALTER TABLE customer_wallets
  DROP COLUMN IF EXISTS version;
-- +goose StatementEnd
