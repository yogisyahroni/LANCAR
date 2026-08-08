-- +goose Up
-- +goose StatementBegin
-- FB-101: potongan promo merchant (merchant_promos, dibiayai merchant sendiri)
-- mengurangi payout settlement — BUKAN komisi PT. Kolom ini dicatat saat
-- settlement food dibuat, supaya audit trail jelas: merchant_net = gross
-- - platform_fee - disbursement_fee - promo_discount.
ALTER TABLE merchant_settlements
    ADD COLUMN IF NOT EXISTS merchant_promo_discount_idr BIGINT NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE merchant_settlements
    DROP COLUMN IF EXISTS merchant_promo_discount_idr;
-- +goose StatementEnd
