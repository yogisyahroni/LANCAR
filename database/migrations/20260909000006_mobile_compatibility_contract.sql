-- +goose Up
-- GLOB-2026-013: publish the minimum client/schema contract during rollout.
-- The values are data-only so the existing system_configs source of truth is kept.

INSERT INTO system_configs (key, value, description, category)
VALUES
  (
    'mobile_merchant_version',
    '{"code": 1, "name": "1.0.0", "force": false, "min_supported_code": 1, "min_supported_name": "1.0.0", "api_schema_version": 1, "supported_schema_versions": [1]}',
    'Latest Merchant App version and compatibility info',
    'mobile'
  )
ON CONFLICT (key) DO UPDATE SET
  value = system_configs.value || EXCLUDED.value,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

UPDATE system_configs
SET value = value || '{"min_supported_code": 1, "min_supported_name": "1.0.0", "api_schema_version": 1, "supported_schema_versions": [1]}'::jsonb
WHERE key IN ('mobile_customer_version', 'mobile_courier_version');

-- +goose Down
UPDATE system_configs
SET value = value - ARRAY['min_supported_code', 'min_supported_name', 'api_schema_version', 'supported_schema_versions']::text[]
WHERE key IN ('mobile_customer_version', 'mobile_courier_version');

DELETE FROM system_configs WHERE key = 'mobile_merchant_version';
