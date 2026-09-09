-- ADMEXP-2026-002: Experience capabilities and explicit market/surface scope.
-- This extends the existing centralized permissions model. It does not create
-- a second identity or authorization source of truth.

-- +goose Up
INSERT INTO permissions (name, description) VALUES
  ('experience.read', 'Read App Experience manifests, previews and observability'),
  ('experience.draft.write', 'Create and edit App Experience drafts'),
  ('experience.asset.write', 'Manage App Experience asset references'),
  ('experience.targeting.write', 'Manage App Experience audience targeting and guardrails'),
  ('experience.feature_flag.write', 'Change platform feature flags from App Experience'),
  ('experience.kill_switch.execute', 'Execute or restore App Experience kill switches'),
  ('experience.submit_approval', 'Submit App Experience revisions for approval'),
  ('experience.approve', 'Approve App Experience high-impact revisions'),
  ('experience.publish', 'Publish approved App Experience revisions'),
  ('experience.rollback', 'Rollback App Experience revisions'),
  ('experience.global.publish', 'Publish App Experience changes with global blast radius'),
  ('experience.version_policy.write', 'Change scoped mobile release policies')
ON CONFLICT (name) DO NOTHING;

-- Existing production roles are mapped here. Suggested blueprint roles that do
-- not exist in users.role are intentionally not invented as parallel roles.
INSERT INTO role_permissions (role, permission_id)
SELECT 'super_admin', id FROM permissions
WHERE name LIKE 'experience.%'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_id)
SELECT 'ops_admin', id FROM permissions
WHERE name IN (
  'experience.read', 'experience.draft.write', 'experience.asset.write',
  'experience.targeting.write',
  'experience.submit_approval', 'experience.publish',
  'experience.version_policy.write'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_id)
SELECT 'ops_security', id FROM permissions
WHERE name IN (
  'experience.read', 'experience.approve', 'experience.kill_switch.execute'
)
ON CONFLICT DO NOTHING;

-- Scope grants are attached to the existing staff role or an individual user.
-- '*' is an explicit global grant; it is never inferred from an Indonesia grant.
CREATE TABLE IF NOT EXISTS experience_admin_scope_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_type VARCHAR(8) NOT NULL CHECK (principal_type IN ('role', 'user')),
  principal_value VARCHAR(128) NOT NULL,
  market_code VARCHAR(32) NOT NULL CHECK (
    market_code = '*' OR market_code ~ '^[a-z0-9][a-z0-9_-]{1,31}$'
  ),
  surface VARCHAR(32) NOT NULL CHECK (
    surface IN ('*', 'customer_android', 'customer_web', 'merchant_android', 'courier_android')
  ),
  reason TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT experience_scope_grant_global_pair_ck CHECK (
    market_code <> '*' OR surface = '*'
  ),
  CONSTRAINT experience_scope_grant_unique UNIQUE (
    principal_type, principal_value, market_code, surface
  )
);

CREATE INDEX IF NOT EXISTS idx_experience_scope_grants_lookup
  ON experience_admin_scope_grants (principal_type, principal_value, market_code, surface);

-- The current operations role is Indonesia-scoped. Security is explicitly
-- global because it handles approval/emergency operations; this is a recorded
-- grant, not a role-name bypass in application code.
INSERT INTO experience_admin_scope_grants (
  principal_type, principal_value, market_code, surface, reason
)
VALUES
  ('role', 'super_admin', '*', '*', 'Global App Experience administration'),
  ('role', 'ops_admin', 'id-jk', '*', 'Indonesia App Experience operations'),
  ('role', 'ops_security', '*', '*', 'Global approval and emergency App Experience operations')
ON CONFLICT DO NOTHING;

GRANT SELECT ON experience_admin_scope_grants TO tembus_admin;

-- +goose Down
REVOKE SELECT ON experience_admin_scope_grants FROM tembus_admin;
DROP TABLE IF EXISTS experience_admin_scope_grants;
DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE name LIKE 'experience.%');
DELETE FROM permissions WHERE name LIKE 'experience.%';
