-- ADMEXP-2026-017: configurable reliability guardrails with an auditable
-- system-config source of truth. Marketing metrics are intentionally excluded.

-- +goose Up
INSERT INTO permissions (name, description) VALUES
  ('experience.guardrail.write', 'Change App Experience reliability guardrail thresholds')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role, permission_id)
SELECT 'super_admin', id FROM permissions WHERE name = 'experience.guardrail.write'
ON CONFLICT DO NOTHING;

INSERT INTO system_configs (key, value, description, category)
VALUES (
  'experience_guardrail_policy',
  '{"version":1,"min_events":20,"max_failure_rate_pct":10,"window_hours":1,"marketing_metrics_excluded":true}'::jsonb,
  'App Experience reliability guardrail thresholds; marketing metrics never suppress reliability alerts',
  'experience'
)
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
 WHERE permission_id = (SELECT id FROM permissions WHERE name = 'experience.guardrail.write');
DELETE FROM permissions WHERE name = 'experience.guardrail.write';
DELETE FROM system_configs WHERE key = 'experience_guardrail_policy';
