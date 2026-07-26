-- Migration: Add missing indexes for wallet transactions
-- Date: 2026-07-13

BEGIN;

CREATE INDEX IF NOT EXISTS idx_customer_wallet_tx_ref ON customer_wallet_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_courier_wallet_tx_ref ON courier_wallet_transactions(reference_id);

COMMIT;
