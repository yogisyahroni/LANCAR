-- +goose Up
-- ECON-2026-001: one versioned pricing policy and market-configurable labels.
-- The quote snapshot stores the resolved version and labels, so changing a
-- later config never reprices an existing order.
INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES
  ('pricing_rule_version', '"marketplace-pricing-2026-v1"',
   'Canonical pricing policy version stored on every quote snapshot', 'pricing', NOW()),
  ('pricing_component_labels_default', '{
    "item_subtotal":"Harga menu",
    "base_fare":"Tarif dasar",
    "distance_fee":"Biaya jarak",
    "weight_surcharge":"Biaya ukuran/berat",
    "dynamic_adjustment":"Penyesuaian permintaan",
    "insurance_fee":"Asuransi",
    "delivery_fee":"Biaya antar",
    "platform_fee":"Biaya layanan",
    "tax":"Pajak",
    "toll_addon":"Tol/add-on",
    "promo_discount":"Diskon promo",
    "membership_subsidy":"Subsidi membership",
    "merchant_commission":"Komisi merchant",
    "merchant_promo_subsidy":"Subsidi promo merchant",
    "courier_earning":"Pendapatan kurir",
    "rounding_adjustment":"Pembulatan"
  }'::jsonb,
   'Stable pricing component labels; override per market with pricing_component_labels_<market>', 'pricing', NOW())
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs
WHERE key IN ('pricing_rule_version', 'pricing_component_labels_default');
