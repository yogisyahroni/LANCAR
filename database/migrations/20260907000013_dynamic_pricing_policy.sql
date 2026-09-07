-- +goose Up
-- ECON-2026-003: versioned, bounded, service/market scoped dynamic pricing.
-- The protected cap is deliberately separate from the ordinary ceiling so an
-- experiment cannot exceed the consumer-protection boundary.
INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES
('dynamic_pricing_policy_default', '{
  "policy_version":"marketplace-pricing-2026-v2",
  "market":"default",
  "service_code":"on_demand",
  "zone_scope":"active_zone",
  "timezone":"Asia/Jakarta",
  "floor_multiplier":1.0,
  "ceiling_multiplier":1.5,
  "protected_cap_multiplier":1.5,
  "peak_multiplier":1.10,
  "peak_windows":[{"start_hour":7,"end_hour":9},{"start_hour":17,"end_hour":20}],
  "fairness_reviewed":true
}'::jsonb, 'Default bounded dynamic pricing policy for package/on-demand services', 'pricing', NOW()),
('dynamic_pricing_policy_default_food_delivery', '{
  "policy_version":"marketplace-pricing-2026-v2",
  "market":"default",
  "service_code":"food_delivery",
  "zone_scope":"active_zone",
  "timezone":"Asia/Jakarta",
  "floor_multiplier":1.0,
  "ceiling_multiplier":1.4,
  "protected_cap_multiplier":1.4,
  "peak_multiplier":1.10,
  "peak_windows":[{"start_hour":11,"end_hour":14},{"start_hour":17,"end_hour":20}],
  "fairness_reviewed":true
}'::jsonb, 'Bounded Food delivery pricing policy', 'pricing', NOW()),
('dynamic_pricing_policy_default_tambal_ban_motor', '{
  "policy_version":"marketplace-pricing-2026-v2",
  "market":"default",
  "service_code":"tambal_ban_motor",
  "zone_scope":"active_zone",
  "timezone":"Asia/Jakarta",
  "floor_multiplier":1.0,
  "ceiling_multiplier":1.2,
  "protected_cap_multiplier":1.2,
  "peak_multiplier":1.0,
  "peak_windows":[],
  "fairness_reviewed":true
}'::jsonb, 'Consumer-protected roadside motor pricing policy', 'pricing', NOW()),
('dynamic_pricing_policy_default_tambal_ban_mobil', '{
  "policy_version":"marketplace-pricing-2026-v2",
  "market":"default",
  "service_code":"tambal_ban_mobil",
  "zone_scope":"active_zone",
  "timezone":"Asia/Jakarta",
  "floor_multiplier":1.0,
  "ceiling_multiplier":1.2,
  "protected_cap_multiplier":1.2,
  "peak_multiplier":1.0,
  "peak_windows":[],
  "fairness_reviewed":true
}'::jsonb, 'Consumer-protected roadside car pricing policy', 'pricing', NOW()),
('dynamic_pricing_policy_default_towing_motor', '{
  "policy_version":"marketplace-pricing-2026-v2",
  "market":"default",
  "service_code":"towing_motor",
  "zone_scope":"active_zone",
  "timezone":"Asia/Jakarta",
  "floor_multiplier":1.0,
  "ceiling_multiplier":1.2,
  "protected_cap_multiplier":1.2,
  "peak_multiplier":1.0,
  "peak_windows":[],
  "fairness_reviewed":true
}'::jsonb, 'Consumer-protected towing motor pricing policy', 'pricing', NOW()),
('dynamic_pricing_policy_default_towing_mobil', '{
  "policy_version":"marketplace-pricing-2026-v2",
  "market":"default",
  "service_code":"towing_mobil",
  "zone_scope":"active_zone",
  "timezone":"Asia/Jakarta",
  "floor_multiplier":1.0,
  "ceiling_multiplier":1.2,
  "protected_cap_multiplier":1.2,
  "peak_multiplier":1.0,
  "peak_windows":[],
  "fairness_reviewed":true
}'::jsonb, 'Consumer-protected towing car pricing policy', 'pricing', NOW())
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs
WHERE key IN (
  'dynamic_pricing_policy_default',
  'dynamic_pricing_policy_default_food_delivery',
  'dynamic_pricing_policy_default_tambal_ban_motor',
  'dynamic_pricing_policy_default_tambal_ban_mobil',
  'dynamic_pricing_policy_default_towing_motor',
  'dynamic_pricing_policy_default_towing_mobil'
);
