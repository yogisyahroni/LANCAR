-- +goose Up
-- Customer-facing aggregator service metadata belongs to the DB/CMS contract,
-- not to mobile presentation code or provider-code conditionals.
ALTER TABLE provider_services
    ADD COLUMN IF NOT EXISTS customer_badge VARCHAR(80),
    ADD COLUMN IF NOT EXISTS customer_description TEXT,
    ADD COLUMN IF NOT EXISTS etd_label VARCHAR(120),
    ADD COLUMN IF NOT EXISTS min_weight_kg NUMERIC(8,2);

INSERT INTO provider_services (
    provider_id, service_code, service_name, description, base_rate,
    customer_badge, customer_description, etd_label, min_weight_kg, is_active
)
SELECT lp.id, seed.service_code, seed.service_name, seed.description, seed.base_rate,
       seed.customer_badge, seed.customer_description, seed.etd_label,
       seed.min_weight_kg, TRUE
FROM logistics_providers lp
JOIN (
    VALUES
      ('jne', 'REG', 'Reguler (2–3 Hari)', 'Pengiriman reguler untuk kebutuhan harian.', 9000::numeric, 'Hemat & Terpercaya', 'Pilihan seimbang untuk pengiriman harian.', '2–3 Hari', 1.0::numeric),
      ('jne', 'YES', 'Next Day (1 Hari)', 'Pengiriman prioritas sesuai SLA provider.', 12000::numeric, 'Garansi Tepat Waktu', 'Estimasi lebih cepat sesuai ketersediaan rute.', '1 Hari', 1.0::numeric),
      ('jne', 'JTR', 'Kargo / Truk (>5 kg)', 'Pengiriman muatan besar berbasis berat.', 5000::numeric, 'Muatan Berat', 'Cocok untuk muatan besar dan volumetrik.', '3–5 Hari', 10.0::numeric),
      ('jnt', 'EZ', 'Reguler (2–3 Hari)', 'Pengiriman reguler untuk kebutuhan harian.', 9000::numeric, 'Hemat & Terpercaya', 'Pilihan seimbang untuk pengiriman harian.', '2–3 Hari', 1.0::numeric)
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
    JOIN (VALUES ('jne', 'REG'), ('jne', 'YES'), ('jne', 'JTR'), ('jnt', 'EZ'))
      AS seed(provider_code, service_code) ON seed.provider_code = lp.code
);
ALTER TABLE provider_services
    DROP COLUMN IF EXISTS min_weight_kg,
    DROP COLUMN IF EXISTS etd_label,
    DROP COLUMN IF EXISTS customer_description,
    DROP COLUMN IF EXISTS customer_badge;
