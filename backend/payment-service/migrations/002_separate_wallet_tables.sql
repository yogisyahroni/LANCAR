-- Migration: Separate Wallet Tables for Extreme Isolation
-- This migration splits the 'wallets' table into 'customer_wallets' and 'courier_wallets'.

BEGIN;

-- 1. Create customer_wallets table
CREATE TABLE IF NOT EXISTS customer_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create courier_wallets table
CREATE TABLE IF NOT EXISTS courier_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_id UUID NOT NULL UNIQUE REFERENCES couriers(id) ON DELETE CASCADE,
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Update wallet_transactions to be polymorphic or separate?
-- Separate transaction tables are cleaner for extreme isolation.

CREATE TABLE IF NOT EXISTS customer_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES customer_wallets(id) ON DELETE CASCADE,
    type transaction_type NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    status transaction_status NOT NULL DEFAULT 'PENDING',
    reference_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courier_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES courier_wallets(id) ON DELETE CASCADE,
    type transaction_type NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    fee NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    status transaction_status NOT NULL DEFAULT 'PENDING',
    reference_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Migrate existing data (if any exists in the old wallets table)
-- Assuming old wallets were for customers primarily for now
INSERT INTO customer_wallets (id, customer_id, balance, currency, version, created_at, updated_at)
SELECT id, user_id, balance, currency, version, created_at, updated_at FROM wallets
WHERE user_id IN (SELECT id FROM customers);

INSERT INTO courier_wallets (id, courier_id, balance, currency, version, created_at, updated_at)
SELECT id, user_id, balance, currency, version, created_at, updated_at FROM wallets
WHERE user_id IN (SELECT id FROM couriers);

-- Drop old tables
DROP TABLE IF EXISTS wallet_transactions;
DROP TABLE IF EXISTS wallets;

COMMIT;
CREATE INDEX IF NOT EXISTS idx_customer_wallet_tx_ref ON customer_wallet_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_courier_wallet_tx_ref ON courier_wallet_transactions(reference_id);
