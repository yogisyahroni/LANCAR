-- MWEB-PORTAL-P0-004: explicit catalog publication snapshots.
-- The merchant catalog remains the editing source of truth. Customer reads the
-- latest immutable publication, while live stock/availability is joined from
-- merchant_menu_items so sold-out changes do not require republishing.

-- +goose Up
CREATE TABLE IF NOT EXISTS merchant_catalog_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  publication_version BIGINT NOT NULL CHECK (publication_version > 0),
  catalog_version BIGINT NOT NULL CHECK (catalog_version >= 0),
  published_by UUID NOT NULL,
  source_publication_id UUID NULL REFERENCES merchant_catalog_publications(id),
  idempotency_key VARCHAR(200) NOT NULL,
  item_count INT NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, publication_version),
  UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_merchant_catalog_publications_latest
  ON merchant_catalog_publications (merchant_id, publication_version DESC);

CREATE TABLE IF NOT EXISTS merchant_catalog_publication_items (
  publication_id UUID NOT NULL REFERENCES merchant_catalog_publications(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  nama VARCHAR(150) NOT NULL,
  harga BIGINT NOT NULL CHECK (harga >= 0),
  foto TEXT NULL,
  deskripsi TEXT NULL,
  kategori VARCHAR(50) NULL,
  prep_time_minutes INT NOT NULL CHECK (prep_time_minutes BETWEEN 1 AND 180),
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (publication_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_catalog_publication_items_lookup
  ON merchant_catalog_publication_items (merchant_id, menu_item_id, publication_id);

-- Existing approved/visible catalogs keep their current customer behavior on
-- migration. New changes still require an explicit publish from the portal.
WITH existing_catalog AS (
  SELECT item.merchant_id,
         COALESCE(MAX(item.version), 0)::bigint AS catalog_version
  FROM merchant_menu_items item
  GROUP BY item.merchant_id
), inserted_publications AS (
  INSERT INTO merchant_catalog_publications (
    merchant_id, publication_version, catalog_version, published_by,
    idempotency_key, item_count
  )
  SELECT item.merchant_id, 1, c.catalog_version, item.merchant_id,
         'migration-initial-' || item.merchant_id::text,
         COUNT(*)::int
  FROM merchant_menu_items item
  JOIN existing_catalog c ON c.merchant_id = item.merchant_id
  WHERE item.status NOT IN ('draft', 'moderation_pending', 'rejected', 'archived')
    AND item.moderation_status = 'approved'
  GROUP BY item.merchant_id, c.catalog_version
  ON CONFLICT (merchant_id, idempotency_key) DO NOTHING
  RETURNING id, merchant_id
)
INSERT INTO merchant_catalog_publication_items (
  publication_id, menu_item_id, merchant_id, nama, harga, foto, deskripsi,
  kategori, prep_time_minutes, images, variants
)
SELECT p.id, item.id, item.merchant_id, item.nama, item.harga, item.foto,
       item.deskripsi, item.kategori, item.prep_time_minutes,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id', image.id, 'menu_item_id', image.menu_item_id, 'url', image.url,
         'alt_text', image.alt_text, 'sort_order', image.sort_order,
         'is_primary', image.is_primary
       ) ORDER BY image.sort_order, image.created_at)
       FROM merchant_menu_item_images image WHERE image.menu_item_id = item.id), '[]'::jsonb),
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id', variant.id, 'menu_item_id', variant.menu_item_id, 'nama', variant.nama,
         'kind', COALESCE(variant.kind, 'variant'), 'status', COALESCE(variant.status, 'active'),
         'is_required', variant.is_required, 'min_select', variant.min_select,
         'max_select', variant.max_select, 'sort_order', variant.sort_order,
         'options', COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'id', option.id, 'variant_id', option.variant_id, 'nama', option.nama,
           'price_delta', option.price_delta, 'is_default', option.is_default
         ) ORDER BY option.created_at)
         FROM menu_item_variant_options option WHERE option.variant_id = variant.id), '[]'::jsonb)
       ) ORDER BY variant.sort_order, variant.created_at)
       FROM menu_item_variants variant WHERE variant.menu_item_id = item.id AND COALESCE(variant.status, 'active') = 'active'), '[]'::jsonb)
FROM merchant_menu_items item
JOIN merchant_catalog_publications p
  ON p.merchant_id = item.merchant_id
 AND p.idempotency_key = 'migration-initial-' || item.merchant_id::text
WHERE item.status NOT IN ('draft', 'moderation_pending', 'rejected', 'archived')
  AND item.moderation_status = 'approved'
ON CONFLICT (publication_id, menu_item_id) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS merchant_catalog_publication_items;
DROP TABLE IF EXISTS merchant_catalog_publications;
