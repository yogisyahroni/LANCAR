-- +goose Up
-- Customer-facing provider cards are managed as catalog metadata so the
-- aggregator can mirror the design without provider-code conditionals.
ALTER TABLE logistics_providers
    ADD COLUMN IF NOT EXISTS customer_badge VARCHAR(80),
    ADD COLUMN IF NOT EXISTS customer_service_label VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customer_rating DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS customer_rating_label VARCHAR(100);

UPDATE logistics_providers
SET customer_badge = 'Paling Cepat',
    customer_service_label = 'Pick-up Cepat',
    customer_rating = 4.9,
    customer_rating_label = 'Pilihan pelanggan'
WHERE code = 'jnt';

UPDATE logistics_providers
SET customer_badge = 'Reguler',
    customer_service_label = 'Hemat & Terpercaya',
    customer_rating = 4.8,
    customer_rating_label = 'Best Seller'
WHERE code = 'jne';

UPDATE logistics_providers
SET customer_badge = COALESCE(customer_badge, 'Reguler'),
    customer_service_label = COALESCE(customer_service_label, 'Layanan provider'),
    customer_rating_label = COALESCE(customer_rating_label, 'Informasi provider')
WHERE code IN ('sicepat', 'anteraja');

-- +goose Down
ALTER TABLE logistics_providers
    DROP COLUMN IF EXISTS customer_rating_label,
    DROP COLUMN IF EXISTS customer_rating,
    DROP COLUMN IF EXISTS customer_service_label,
    DROP COLUMN IF EXISTS customer_badge;
