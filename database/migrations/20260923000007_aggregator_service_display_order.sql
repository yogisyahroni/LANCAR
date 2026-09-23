-- +goose Up
ALTER TABLE provider_services
    ADD COLUMN IF NOT EXISTS customer_display_order INTEGER;

UPDATE provider_services ps
SET customer_display_order = seed.display_order,
    updated_at = NOW()
FROM logistics_providers lp
JOIN (
    VALUES
      ('jnt', 'EZ', 1),
      ('jnt', 'NEXT', 2),
      ('jnt', 'JTR', 3),
      ('jne', 'REG', 1),
      ('jne', 'YES', 2),
      ('jne', 'JTR', 3)
) AS seed(provider_code, service_code, display_order)
  ON seed.provider_code = lp.code
WHERE ps.provider_id = lp.id
  AND ps.service_code = seed.service_code;

-- +goose Down
ALTER TABLE provider_services
    DROP COLUMN IF EXISTS customer_display_order;
