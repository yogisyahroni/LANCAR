-- +goose Up
-- Keep the package taxonomy used by the customer aggregator screen in the
-- existing system-config source of truth so Operations can change labels
-- without shipping a new mobile binary.
INSERT INTO system_configs (key, value, description, category)
VALUES (
  'aggregator_package_categories',
  '[
    {"code": "documents", "label": "Dokumen & Berkas"},
    {"code": "fashion", "label": "Pakaian & Fashion"},
    {"code": "food", "label": "Makanan"},
    {"code": "electronics", "label": "Elektronik"},
    {"code": "other", "label": "Lainnya"}
  ]'::jsonb,
  'Kategori paket yang ditampilkan pada customer aggregator mobile',
  'logistics'
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- +goose Down
DELETE FROM system_configs WHERE key = 'aggregator_package_categories';
