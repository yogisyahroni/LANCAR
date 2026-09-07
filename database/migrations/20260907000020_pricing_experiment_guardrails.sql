-- +goose Up
-- ECON-2026-010: deterministic food-pricing experiment contract.
-- The experiment is disabled by default. Admin activation is audited and
-- bounded; existing order pricing_snapshot rows remain immutable.
INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES (
  'marketplace_pricing_experiment_food_delivery',
  '{
    "experiment_id":"food-pricing-guardrail-v1",
    "service_code":"food_delivery",
    "market":"default",
    "enabled":false,
    "killed":false,
    "assignment_salt":"food-pricing-guardrail-v1-server-salt",
    "traffic_percent":0,
    "control_pricing_rule_version":"marketplace-pricing-2026-v2",
    "treatment_pricing_rule_version":"marketplace-pricing-2026-food-treatment-v1",
    "treatment_multiplier":1.05,
    "guardrails":{
      "min_sample_size":100,
      "max_cancellation_delta_pp":2,
      "max_eta_increase_minutes":5,
      "max_support_contact_delta_pp":1,
      "max_courier_earnings_drop_pct":5,
      "max_margin_drop_pct":5
    }
  }'::jsonb,
  'Deterministic food pricing experiment with financial and customer/courier guardrails',
  'pricing',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_orders_pricing_experiment_snapshot
  ON orders ((pricing_snapshot->>'experiment_id'), (pricing_snapshot->>'experiment_variant'), created_at)
  WHERE pricing_snapshot IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_orders_pricing_experiment_snapshot;
DELETE FROM system_configs WHERE key = 'marketplace_pricing_experiment_food_delivery';
