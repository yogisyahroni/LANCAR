-- +goose Up
-- The first UAT scope is On Demand only. Regular is not an alias for
-- package_on_demand; historical Regular rows remain queryable for audit but
-- are no longer selectable by the catalog or feature-flag evaluation.
UPDATE feature_flags
SET
  is_enabled = FALSE,
  config = COALESCE(config, '{}'::jsonb) || '{"disabled_reason":"uat_scope_ondemand_only"}'::jsonb,
  evaluation_revision = COALESCE(evaluation_revision, 1) + 1,
  updated_at = NOW()
WHERE key IN ('tembus_reg', 'tembus_yes');

UPDATE delivery_service_products
SET
  is_enabled = FALSE,
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"disabled_reason":"uat_scope_ondemand_only"}'::jsonb,
  updated_at = NOW()
WHERE service_category = 'regular'
   OR code IN ('tembus_reg', 'tembus_yes');

-- Explicit UAT allowlist for isolated test identities and non-withdrawable
-- customer credit. This table is intentionally separate from production
-- wallet balances so a test seed cannot silently make every new account rich.
CREATE TABLE IF NOT EXISTS uat_test_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('customer', 'courier')),
  allow_withdrawal BOOLEAN NOT NULL DEFAULT FALSE,
  wallet_credit_idr BIGINT NOT NULL DEFAULT 0 CHECK (wallet_credit_idr >= 0),
  wallet_credit_reference VARCHAR(160) UNIQUE,
  wallet_credit_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uat_test_accounts_active_credit
  ON uat_test_accounts (account_type, wallet_credit_expires_at)
  WHERE wallet_credit_idr > 0 AND allow_withdrawal = FALSE;

-- +goose Down
DROP TABLE IF EXISTS uat_test_accounts;

UPDATE delivery_service_products
SET is_enabled = FALSE,
    updated_at = NOW()
WHERE service_category = 'regular'
   OR code IN ('tembus_reg', 'tembus_yes');
