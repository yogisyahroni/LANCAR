-- +goose Up
-- +goose StatementBegin
-- FB-098: promo yang DIBIAYAI MERCHANT sendiri (diskon menu, beli-1-gratis-1).
-- Beda dengan promo_campaigns (dibiayai platform, component_scope terbatas ke
-- shipping/insurance/service_fee/referral — TIDAK bisa diskon harga item).
-- Potongan merchant_promos mengurangi merchant_net di settlement (FB-101),
-- BUKAN komisi PT.
CREATE TABLE IF NOT EXISTS merchant_promos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id      UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    menu_item_id     UUID REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
    discount_type    VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'fixed', 'buy1get1')),
    discount_value   BIGINT NOT NULL CHECK (discount_value > 0),
    max_discount_idr BIGINT CHECK (max_discount_idr IS NULL OR max_discount_idr > 0),
    starts_at        TIMESTAMPTZ NOT NULL,
    ends_at          TIMESTAMPTZ NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT merchant_promos_time_window CHECK (ends_at > starts_at)
);

CREATE INDEX idx_merchant_promos_merchant ON merchant_promos(merchant_id);
CREATE INDEX idx_merchant_promos_active ON merchant_promos(merchant_id) WHERE is_active = TRUE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS merchant_promos;
-- +goose StatementEnd
