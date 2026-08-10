-- +goose Up
-- +goose StatementBegin
-- FB-082: cancellation fee yang di-charge ke merchant saat order batal
-- karena KESALAHAN MERCHANT (reject / timeout 3 menit / gagal siapkan).
-- Customer tetap refund 100%; platform fee menjadi piutang merchant yang
-- dipotong dari settlement merchant berikutnya (order delivered).
CREATE TABLE IF NOT EXISTS merchant_cancellation_fees (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id                UUID NOT NULL REFERENCES merchants(id),
    order_id                   UUID NOT NULL REFERENCES orders(id),
    amount_idr                 BIGINT NOT NULL CHECK (amount_idr > 0),
    reason                     TEXT,
    status                     VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | DEDUCTED
    deducted_from_settlement_id UUID NULL REFERENCES merchant_settlements(id),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deducted_at                TIMESTAMPTZ,
    UNIQUE (order_id)
);

CREATE INDEX idx_mcf_merchant_pending ON merchant_cancellation_fees(merchant_id, status);
CREATE INDEX idx_mcf_order ON merchant_cancellation_fees(order_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS merchant_cancellation_fees;
-- +goose StatementEnd
