-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-067: Merchant Settlement untuk Order Food
-- Order food on-demand tidak punya payment_link (dibayar langsung
-- via wallet), sehingga merchant_settlements.payment_link_id harus
-- nullable. Settlement food memakai idempotency_key "settle-order-<id>".
-- Settlement berbasis payment link tetap berfungsi seperti biasa.
-- ============================================================

ALTER TABLE merchant_settlements
    DROP CONSTRAINT IF EXISTS merchant_settlements_payment_link_id_fkey;

ALTER TABLE merchant_settlements
    ALTER COLUMN payment_link_id DROP NOT NULL;

-- FK tetap dijaga untuk record yang punya payment link;
-- jika payment link dihapus, settlement tidak ikut hilang (audit trail).
ALTER TABLE merchant_settlements
    ADD CONSTRAINT merchant_settlements_payment_link_id_fkey
    FOREIGN KEY (payment_link_id) REFERENCES payment_links(id)
    ON DELETE SET NULL;

-- +goose Down
ALTER TABLE merchant_settlements
    DROP CONSTRAINT IF EXISTS merchant_settlements_payment_link_id_fkey;

ALTER TABLE merchant_settlements
    ALTER COLUMN payment_link_id SET NOT NULL;

ALTER TABLE merchant_settlements
    ADD CONSTRAINT merchant_settlements_payment_link_id_fkey
    FOREIGN KEY (payment_link_id) REFERENCES payment_links(id);
