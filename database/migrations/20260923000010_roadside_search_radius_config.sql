-- +goose Up
-- LANCAR — Admin-managed progressive discovery radius for roadside services.
-- The order-service reads these values; it must not carry a runtime default.

UPDATE delivery_service_products
SET search_radii_km = '[1, 5, 10]'::jsonb,
    updated_at = NOW()
WHERE code IN ('tambal_ban_motor', 'tambal_ban_mobil');

UPDATE delivery_service_products
SET search_radii_km = '[10, 25, 50]'::jsonb,
    updated_at = NOW()
WHERE code IN ('towing_motor', 'towing_mobil');

-- +goose Down
UPDATE delivery_service_products
SET search_radii_km = '[5]'::jsonb,
    updated_at = NOW()
WHERE code IN ('tambal_ban_motor', 'tambal_ban_mobil');

UPDATE delivery_service_products
SET search_radii_km = '[10]'::jsonb,
    updated_at = NOW()
WHERE code IN ('towing_motor', 'towing_mobil');
