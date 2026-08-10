-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-004: merchant_menu_items
-- ============================================================

CREATE TABLE IF NOT EXISTS merchant_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  nama VARCHAR(150) NOT NULL,
  harga BIGINT NOT NULL DEFAULT 0 CHECK (harga >= 0),
  foto TEXT NULL,
  kategori VARCHAR(50) NULL,
  prep_time_minutes INT NOT NULL DEFAULT 10 CHECK (prep_time_minutes BETWEEN 1 AND 180),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_menu_items_merchant
  ON merchant_menu_items(merchant_id) WHERE is_available = TRUE;

-- +goose Down
DROP TABLE IF EXISTS merchant_menu_items;
