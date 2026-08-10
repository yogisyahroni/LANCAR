-- +goose Up
-- ============================================================
-- FB-109: minimum order value merchant — merchant bisa menolak order
-- kecil yang tidak sepadan dengan effort masak.
-- min_order_idr BIGINT NOT NULL DEFAULT 0 = tanpa batas minimum.
-- ============================================================

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS min_order_idr BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN merchants.min_order_idr IS 'Minimum subtotal order (IDR). 0 = tanpa minimum (FB-109).';

-- +goose Down
ALTER TABLE merchants
  DROP COLUMN IF EXISTS min_order_idr;
