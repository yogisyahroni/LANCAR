-- +goose Up
-- ECON-2026-008: emergency rollback control for marketplace pricing.
-- JSONB false is the safe default. When true, order-service uses the base
-- multiplier immediately and keeps the policy version for audit/requote.
INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES (
  'marketplace_pricing_kill_switch',
  'false'::jsonb,
  'Emergency pricing rollback: disable dynamic/peak pricing and use base multiplier',
  'pricing',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs WHERE key = 'marketplace_pricing_kill_switch';
