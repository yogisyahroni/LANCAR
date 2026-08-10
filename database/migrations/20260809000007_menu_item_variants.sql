-- +goose Up
-- ============================================================
-- LANCAR — FB-108: Varian/Opsi Menu Item
-- Menu tidak lagi single-variant: merchant bisa definisikan grup
-- varian (Ukuran, Level Pedas, Tambahan) dengan opsi berharga delta.
-- food_order_item_variants = snapshot pilihan saat order (nama + harga
-- beku, konsisten dengan pola snapshot food_order_items).
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  nama VARCHAR(80) NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  -- min_select/max_select: 0/1 = single choice (radio);
  -- max_select > 1 = multi pilih (checkbox). Wajib = min_select >= 1.
  min_select INT NOT NULL DEFAULT 0 CHECK (min_select BETWEEN 0 AND 10),
  max_select INT NOT NULL DEFAULT 1 CHECK (max_select BETWEEN 1 AND 10),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item
  ON menu_item_variants(menu_item_id);

CREATE TABLE IF NOT EXISTS menu_item_variant_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  nama VARCHAR(80) NOT NULL,
  price_delta BIGINT NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_item_variant_options_variant
  ON menu_item_variant_options(variant_id);

CREATE TABLE IF NOT EXISTS food_order_item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES food_order_items(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL,
  option_id UUID NOT NULL,
  -- Snapshot nama + harga delta (harga tidak berubah walau menu diedit)
  variant_name VARCHAR(80) NOT NULL,
  option_name VARCHAR(80) NOT NULL,
  price_delta BIGINT NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_order_item_variants_order_item
  ON food_order_item_variants(order_item_id);

-- +goose Down
DROP TABLE IF EXISTS food_order_item_variants;
DROP TABLE IF EXISTS menu_item_variant_options;
DROP TABLE IF EXISTS menu_item_variants;
