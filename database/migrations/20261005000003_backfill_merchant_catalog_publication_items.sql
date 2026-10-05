-- Repair the initial publication snapshot when the publication metadata and
-- its item rows were created in the same data-modifying CTE statement.

-- +goose Up
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

UPDATE merchant_catalog_publications p
SET item_count = snapshot.item_count
FROM (
  SELECT publication_id, COUNT(*)::int AS item_count
  FROM merchant_catalog_publication_items
  GROUP BY publication_id
) snapshot
WHERE p.id = snapshot.publication_id;

-- +goose Down
DELETE FROM merchant_catalog_publication_items item
USING merchant_catalog_publications publication
WHERE item.publication_id = publication.id
  AND publication.idempotency_key LIKE 'migration-initial-%';
