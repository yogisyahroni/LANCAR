-- +goose Up
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_settlements_idempotency ON merchant_settlements(idempotency_key);

-- +goose Down
DROP INDEX IF EXISTS idx_merchant_settlements_idempotency;
