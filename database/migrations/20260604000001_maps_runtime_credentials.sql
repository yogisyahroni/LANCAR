-- +goose Up
-- ============================================================
-- Runtime Maps Credentials
-- Stores Google Maps server-side credentials encrypted at rest.
-- Plaintext keys must never be stored or returned by the API.
-- ============================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'customer',
    'courier',
    'ops_security',
    'ops_admin',
    'finance_admin',
    'cs_agent',
    'zone_manager',
    'super_admin'
  ));

-- +goose StatementBegin
DO $$
BEGIN
  IF to_regclass('public.staff') IS NOT NULL THEN
    ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
    ALTER TABLE staff
      ADD CONSTRAINT staff_role_check
      CHECK (role IN (
        'ops_security',
        'ops_admin',
        'finance_admin',
        'cs_agent',
        'zone_manager',
        'super_admin'
      ));
  END IF;
END $$;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS maps_provider_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(40) NOT NULL CHECK (provider IN ('google_maps')),
  scope VARCHAR(40) NOT NULL DEFAULT 'server',
  key_alias VARCHAR(100) NOT NULL,
  key_mask VARCHAR(32) NOT NULL,
  encrypted_secret TEXT NOT NULL,
  encryption_kid VARCHAR(120) NOT NULL,
  secret_fingerprint VARCHAR(64) NOT NULL UNIQUE,
  enabled_apis TEXT[] NOT NULL DEFAULT ARRAY['geocoding', 'routes']::text[],
  restriction_type VARCHAR(40) NOT NULL DEFAULT 'unknown'
    CHECK (restriction_type IN ('server_ip', 'http_referrer', 'android', 'ios', 'unrestricted', 'unknown')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_validation_status VARCHAR(20) NOT NULL DEFAULT 'untested'
    CHECK (last_validation_status IN ('untested', 'valid', 'invalid')),
  last_error_code VARCHAR(100),
  last_validated_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  activated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_maps_provider_credentials_active_google
  ON maps_provider_credentials (provider)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maps_provider_credentials_status
  ON maps_provider_credentials (provider, last_validation_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_maps_provider_credentials_created_by
  ON maps_provider_credentials (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS maps_provider_credential_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credential_id UUID REFERENCES maps_provider_credentials(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL CHECK (action IN ('created', 'validated', 'activated', 'deactivated')),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  key_alias VARCHAR(100),
  validation_status VARCHAR(20) CHECK (validation_status IN ('untested', 'valid', 'invalid')),
  error_code VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maps_provider_credential_events_credential
  ON maps_provider_credential_events (credential_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maps_provider_credential_events_actor
  ON maps_provider_credential_events (actor_id, created_at DESC);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_maps_provider_credential_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'maps_provider_credential_events is an immutable audit table';
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_prevent_maps_provider_credential_event_mutation
  ON maps_provider_credential_events;

-- +goose StatementBegin
CREATE TRIGGER trg_prevent_maps_provider_credential_event_mutation
BEFORE UPDATE OR DELETE ON maps_provider_credential_events
FOR EACH ROW
EXECUTE FUNCTION prevent_maps_provider_credential_event_mutation();
-- +goose StatementEnd

-- +goose Down
DROP TRIGGER IF EXISTS trg_prevent_maps_provider_credential_event_mutation
  ON maps_provider_credential_events;
DROP FUNCTION IF EXISTS prevent_maps_provider_credential_event_mutation;
DROP TABLE IF EXISTS maps_provider_credential_events;
DROP INDEX IF EXISTS idx_maps_provider_credentials_created_by;
DROP INDEX IF EXISTS idx_maps_provider_credentials_status;
DROP INDEX IF EXISTS idx_maps_provider_credentials_active_google;
DROP TABLE IF EXISTS maps_provider_credentials;

UPDATE users SET role = 'ops_admin' WHERE role = 'ops_security';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'customer',
    'courier',
    'ops_admin',
    'finance_admin',
    'cs_agent',
    'zone_manager',
    'super_admin'
  ));

-- +goose StatementBegin
DO $$
BEGIN
  IF to_regclass('public.staff') IS NOT NULL THEN
    UPDATE staff SET role = 'ops_admin' WHERE role = 'ops_security';
    ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
    ALTER TABLE staff
      ADD CONSTRAINT staff_role_check
      CHECK (role IN (
        'ops_admin',
        'finance_admin',
        'cs_agent',
        'zone_manager',
        'super_admin'
      ));
  END IF;
END $$;
-- +goose StatementEnd
