-- +goose Up
-- J&T's customer-facing service catalog is persisted alongside the provider
-- configuration so the mobile aggregator can render the Figma service rail
-- from the same tariff source used during quote creation.
INSERT INTO provider_services (
    provider_id,
    service_code,
    service_name,
    description,
    base_rate,
    customer_badge,
    customer_description,
    etd_label,
    min_weight_kg,
    is_active
)
SELECT lp.id, seed.service_code, seed.service_name, seed.description, seed.base_rate,
       seed.customer_badge, seed.customer_description, seed.etd_label,
       seed.min_weight_kg, TRUE
FROM logistics_providers lp
JOIN (
    VALUES
      ('jnt', 'EZ', 'Reguler (2–3 Hari)', 'Pengiriman reguler untuk kebutuhan harian.', 19000::numeric, 'Hemat & Terpercaya', 'Pilihan seimbang untuk pengiriman harian.', '2–3 Hari', 1.0::numeric),
      ('jnt', 'NEXT', 'Next Day (1 Hari)', 'Pengiriman prioritas sesuai SLA provider.', 28000::numeric, 'Garansi Tepat Waktu', 'Lebih cepat untuk paket yang perlu segera tiba.', '1 Hari', 1.0::numeric),
      ('jnt', 'JTR', 'Kargo / Truk (>5 kg)', 'Pengiriman muatan besar berbasis berat.', 9000::numeric, 'Muatan Berat', 'Cocok untuk muatan besar dan volumetrik.', '3–5 Hari', 5.0::numeric)
) AS seed(provider_code, service_code, service_name, description, base_rate, customer_badge, customer_description, etd_label, min_weight_kg)
  ON seed.provider_code = lp.code
ON CONFLICT (provider_id, service_code) DO UPDATE SET
    service_name = EXCLUDED.service_name,
    description = EXCLUDED.description,
    base_rate = EXCLUDED.base_rate,
    customer_badge = EXCLUDED.customer_badge,
    customer_description = EXCLUDED.customer_description,
    etd_label = EXCLUDED.etd_label,
    min_weight_kg = EXCLUDED.min_weight_kg,
    is_active = TRUE,
    updated_at = NOW();

-- +goose Down
DELETE FROM provider_services
WHERE (provider_id, service_code) IN (
    SELECT lp.id, seed.service_code
    FROM logistics_providers lp
    JOIN (VALUES ('jnt', 'NEXT'), ('jnt', 'JTR'))
      AS seed(provider_code, service_code) ON seed.provider_code = lp.code
);
UPDATE provider_services ps
SET base_rate = 9000,
    updated_at = NOW()
FROM logistics_providers lp
WHERE ps.provider_id = lp.id
  AND lp.code = 'jnt'
  AND ps.service_code = 'EZ';
