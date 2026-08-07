-- +goose Up
-- ============================================================
-- LANCAR — Driver Tips (FB-077, semua service: parcel/tambal/towing/food)
-- Customer kasih tip ke kurir saat order aktif ATAU setelah selesai.
-- Dana: wallet customer (customer_wallet_liability) → 100% wallet kurir.
-- 1 tip per order (MVP, anti-abuse); idempotency lewat payment-ref = order_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS driver_tips (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id         UUID NOT NULL REFERENCES orders(id),
    customer_id      UUID NOT NULL REFERENCES users(id),
    courier_id       UUID NOT NULL REFERENCES users(id),
    amount_idr       BIGINT NOT NULL CHECK (amount_idr > 0),
    service_sub_type VARCHAR(30) NOT NULL DEFAULT 'parcel',
    status           VARCHAR(20) NOT NULL DEFAULT 'paid'
                     CHECK (status IN ('paid','refunded')),
    payment_ref      VARCHAR(100),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1 tip per order (unique index = idempotency lapis DB)
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_tips_order_unique ON driver_tips(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_tips_courier_created ON driver_tips(courier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_tips_customer ON driver_tips(customer_id);

-- +goose Down
DROP TABLE IF EXISTS driver_tips;
