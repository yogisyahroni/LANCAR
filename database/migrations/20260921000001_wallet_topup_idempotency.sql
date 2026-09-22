-- +goose Up
-- UIUX-2026-008: make customer wallet top-up retries resolve to one
-- provider session. The application derives TOPUP-{UUID} from the client
-- idempotency key; historical non-top-up references remain unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_wallet_topup_reference_unique
    ON customer_wallet_transactions(reference_id)
    WHERE type = 'DEPOSIT' AND reference_id LIKE 'TOPUP-%';

-- +goose Down
DROP INDEX IF EXISTS idx_customer_wallet_topup_reference_unique;
