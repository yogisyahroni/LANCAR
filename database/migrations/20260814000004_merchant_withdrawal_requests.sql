-- +goose Up
-- M7: Withdrawal request UI merchant (FB-113 lanjutan)
-- Merchant bisa ajukan pencairan saldo tersedia (total_idr - holding_idr)
-- dari tabel merchant_settlements. Request disimpan & diproses (manual/otomatis).
CREATE TABLE IF NOT EXISTS merchant_withdrawal_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    amount_idr      BIGINT NOT NULL CHECK (amount_idr > 0),
    bank_name       VARCHAR(64) NOT NULL,
    bank_account_number VARCHAR(64) NOT NULL,
    bank_account_holder VARCHAR(128) NOT NULL,
    status          VARCHAR(24) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'failed')),
    rejection_reason TEXT,
    disbursement_ref VARCHAR(128),
    idempotency_key UUID NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_withdrawal_merchant
    ON merchant_withdrawal_requests(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_withdrawal_status
    ON merchant_withdrawal_requests(status, created_at DESC);

-- +goose Down

DROP TABLE IF EXISTS merchant_withdrawal_requests;
