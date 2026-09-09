-- +goose Up
-- APP-2026-015: version/update policy is scoped by market and client platform.
-- The policy controls release metadata and compatibility gates only; native
-- capabilities still require a reviewed store release.
CREATE TABLE IF NOT EXISTS mobile_release_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE RESTRICT,
  client_type VARCHAR(16) NOT NULL CHECK (client_type IN ('customer', 'courier', 'merchant', 'web')),
  platform VARCHAR(16) NOT NULL CHECK (platform IN ('android', 'web')),
  latest_version_code INTEGER NOT NULL CHECK (latest_version_code > 0),
  latest_version_name VARCHAR(64) NOT NULL,
  min_supported_version_code INTEGER NOT NULL CHECK (min_supported_version_code > 0),
  min_supported_version_name VARCHAR(64) NOT NULL,
  recommended_version_code INTEGER,
  recommended_version_name VARCHAR(64),
  update_mode VARCHAR(8) NOT NULL DEFAULT 'none' CHECK (update_mode IN ('none', 'soft', 'hard')),
  hard_block_reason VARCHAR(16) NOT NULL DEFAULT 'none' CHECK (hard_block_reason IN ('none', 'unsafe', 'incompatible')),
  localized_messages JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(localized_messages) = 'object'),
  store_destinations JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(store_destinations) = 'object'),
  allow_active_order_access BOOLEAN NOT NULL DEFAULT TRUE,
  allow_support_access BOOLEAN NOT NULL DEFAULT TRUE,
  allow_new_transactions BOOLEAN NOT NULL DEFAULT TRUE,
  remote_config_scope VARCHAR(24) NOT NULL DEFAULT 'release_metadata'
    CHECK (remote_config_scope = 'release_metadata'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mobile_release_policy_version_order_ck CHECK (
    min_supported_version_code <= latest_version_code
    AND (recommended_version_code IS NULL OR (
      recommended_version_code >= min_supported_version_code
      AND recommended_version_code <= latest_version_code
    ))
  ),
  CONSTRAINT mobile_release_policy_recommended_name_ck CHECK (
    (recommended_version_code IS NULL AND recommended_version_name IS NULL)
    OR (recommended_version_code IS NOT NULL AND recommended_version_name IS NOT NULL)
  ),
  CONSTRAINT mobile_release_policy_window_ck CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT mobile_release_policy_hard_gate_ck CHECK (
    (update_mode <> 'hard' AND hard_block_reason = 'none')
    OR (
      update_mode = 'hard'
      AND hard_block_reason IN ('unsafe', 'incompatible')
      AND allow_active_order_access
      AND allow_support_access
      AND NOT allow_new_transactions
    )
  ),
  CONSTRAINT mobile_release_policy_scope_unique UNIQUE (market_code, client_type, platform)
);

CREATE INDEX IF NOT EXISTS idx_mobile_release_policy_lookup
  ON mobile_release_policies (market_code, client_type, platform, effective_from DESC);

CREATE TABLE IF NOT EXISTS mobile_release_policy_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES mobile_release_policies(id) ON DELETE RESTRICT,
  market_code VARCHAR(32) NOT NULL,
  client_type VARCHAR(16) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  revision INTEGER NOT NULL,
  action VARCHAR(24) NOT NULL CHECK (action IN ('seeded', 'updated', 'rolled_back')),
  actor_id UUID,
  reason TEXT NOT NULL,
  previous_policy JSONB,
  new_policy JSONB NOT NULL,
  correlation_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mobile_release_policy_audit_json_ck CHECK (
    jsonb_typeof(new_policy) = 'object'
    AND (previous_policy IS NULL OR jsonb_typeof(previous_policy) = 'object')
  )
);

CREATE INDEX IF NOT EXISTS idx_mobile_release_policy_audit_lookup
  ON mobile_release_policy_audit (market_code, client_type, platform, created_at DESC);

-- Audit history is append-only. The current policy is updated only through
-- the service transaction, which writes the before/after snapshot here.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_mobile_release_policy_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mobile_release_policy_audit is append-only';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_mobile_release_policy_audit_immutable ON mobile_release_policy_audit;
CREATE TRIGGER trg_mobile_release_policy_audit_immutable
  BEFORE UPDATE OR DELETE ON mobile_release_policy_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_mobile_release_policy_audit_mutation();

-- Seed the existing release metadata into the new scoped source of truth.
-- Legacy system_configs remain for backward compatibility with older tooling.
WITH update_url AS (
  SELECT COALESCE(value #>> '{}', 'https://github.com/yogisyahroni/TEMBUS/releases') AS url
  FROM system_configs WHERE key = 'mobile_update_url' LIMIT 1
), seeded AS (
  SELECT 'customer'::VARCHAR AS client_type, 'mobile_customer_version'::VARCHAR AS config_key
  UNION ALL SELECT 'courier', 'mobile_courier_version'
  UNION ALL SELECT 'merchant', 'mobile_merchant_version'
)
INSERT INTO mobile_release_policies (
  market_code, client_type, platform, latest_version_code, latest_version_name,
  min_supported_version_code, min_supported_version_name,
  recommended_version_code, recommended_version_name, update_mode,
  hard_block_reason, localized_messages, store_destinations,
  allow_active_order_access, allow_support_access, allow_new_transactions,
  remote_config_scope
)
SELECT
  'id-jk',
  seeded.client_type,
  'android',
  GREATEST(1, COALESCE((cfg.value->>'code')::INTEGER, 1)),
  COALESCE(NULLIF(cfg.value->>'name', ''), '1.0.0'),
  GREATEST(1, COALESCE((cfg.value->>'min_supported_code')::INTEGER, (cfg.value->>'code')::INTEGER, 1)),
  COALESCE(NULLIF(cfg.value->>'min_supported_name', ''), NULLIF(cfg.value->>'name', ''), '1.0.0'),
  GREATEST(1, COALESCE((cfg.value->>'code')::INTEGER, 1)),
  COALESCE(NULLIF(cfg.value->>'name', ''), '1.0.0'),
  'soft', 'none',
  '{"id-ID":"Versi baru tersedia. Perbarui aplikasi saat siap.","en-US":"A new version is available. Update when ready."}'::jsonb,
  jsonb_build_object('primary', (SELECT url FROM update_url)),
  TRUE, TRUE, TRUE, 'release_metadata'
FROM seeded
JOIN system_configs cfg ON cfg.key = seeded.config_key
ON CONFLICT (market_code, client_type, platform) DO NOTHING;

INSERT INTO mobile_release_policies (
  market_code, client_type, platform, latest_version_code, latest_version_name,
  min_supported_version_code, min_supported_version_name,
  recommended_version_code, recommended_version_name, update_mode,
  hard_block_reason, localized_messages, store_destinations,
  allow_active_order_access, allow_support_access, allow_new_transactions,
  remote_config_scope
)
SELECT
  'id-jk', 'web', 'web', 1, '1.0.0', 1, '1.0.0', 1, '1.0.0',
  'none', 'none',
  '{"id-ID":"Versi web terbaru tersedia.","en-US":"The latest web version is available."}'::jsonb,
  '{}'::jsonb, TRUE, TRUE, TRUE, 'release_metadata'
WHERE NOT EXISTS (
  SELECT 1 FROM mobile_release_policies
  WHERE market_code = 'id-jk' AND client_type = 'web' AND platform = 'web'
);

INSERT INTO mobile_release_policy_audit (
  policy_id, market_code, client_type, platform, revision, action, reason, new_policy
)
SELECT id, market_code, client_type, platform, revision, 'seeded',
       'APP-2026-015 compatibility policy migration',
       to_jsonb(mrp) - 'id'
FROM mobile_release_policies mrp
WHERE NOT EXISTS (
  SELECT 1 FROM mobile_release_policy_audit audit
  WHERE audit.policy_id = mrp.id
);

GRANT SELECT, INSERT, UPDATE ON mobile_release_policies TO tembus_admin;
GRANT SELECT, INSERT ON mobile_release_policy_audit TO tembus_admin;

-- +goose Down
DROP TRIGGER IF EXISTS trg_mobile_release_policy_audit_immutable ON mobile_release_policy_audit;
DROP FUNCTION IF EXISTS prevent_mobile_release_policy_audit_mutation();
DROP TABLE IF EXISTS mobile_release_policy_audit;
DROP TABLE IF EXISTS mobile_release_policies;
