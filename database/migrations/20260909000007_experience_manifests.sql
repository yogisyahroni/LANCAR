-- +goose Up
-- APP-2026-001: versioned, server-driven presentation manifests.  This stays
-- in the existing admin/configuration database boundary; it never owns
-- pricing, payment, order-state or authorization rules.
CREATE TABLE IF NOT EXISTS experience_manifest_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version BETWEEN 1 AND 10),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE RESTRICT,
  locale VARCHAR(35) NOT NULL,
  surface VARCHAR(32) NOT NULL CHECK (
    surface IN ('customer_android', 'customer_web', 'merchant_android', 'courier_android')
  ),
  min_app_version VARCHAR(64) NOT NULL,
  max_app_version VARCHAR(64),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  ttl_seconds INTEGER NOT NULL DEFAULT 300 CHECK (ttl_seconds BETWEEN 0 AND 86400),
  cache_policy VARCHAR(16) NOT NULL DEFAULT 'private'
    CHECK (cache_policy IN ('no-store', 'private', 'public')),
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(targeting) = 'object'),
  sections JSONB NOT NULL CHECK (jsonb_typeof(sections) = 'array'),
  asset_references JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(asset_references) = 'array'),
  content_checksum CHAR(64) NOT NULL CHECK (content_checksum ~ '^[a-f0-9]{64}$'),
  signature VARCHAR(128),
  state VARCHAR(16) NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'published', 'superseded', 'rolled_back')),
  created_by UUID,
  updated_by UUID,
  published_by UUID,
  published_at TIMESTAMPTZ,
  rolled_back_by UUID,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT experience_manifest_locale_ck CHECK (
    locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),
  CONSTRAINT experience_manifest_min_version_ck CHECK (
    min_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'
  ),
  CONSTRAINT experience_manifest_max_version_ck CHECK (
    max_app_version IS NULL OR max_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'
  ),
  CONSTRAINT experience_manifest_schedule_ck CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT experience_manifest_revision_unique UNIQUE (manifest_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_experience_manifest_resolution
  ON experience_manifest_revisions (market_code, surface, state, starts_at, ends_at, locale);
CREATE INDEX IF NOT EXISTS idx_experience_manifest_history
  ON experience_manifest_revisions (manifest_id, revision DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_experience_manifest_published
  ON experience_manifest_revisions (manifest_id)
  WHERE state = 'published';

CREATE TABLE IF NOT EXISTS experience_manifest_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES experience_manifest_revisions(id) ON DELETE RESTRICT,
  manifest_id UUID NOT NULL,
  revision INTEGER NOT NULL,
  action VARCHAR(32) NOT NULL CHECK (
    action IN ('draft_created', 'draft_updated', 'previewed', 'published', 'superseded', 'rolled_back')
  ),
  actor_id UUID,
  reason TEXT,
  correlation_id VARCHAR(128),
  previous_state VARCHAR(16),
  new_state VARCHAR(16) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experience_manifest_audit_history
  ON experience_manifest_audit (manifest_id, revision DESC, created_at DESC);

-- A published revision may change lifecycle metadata only.  Its manifest
-- payload/checksum/signature/scope are immutable, so rollback always points
-- to a historical revision instead of mutating the content in place.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_published_experience_manifest_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'experience manifest revision history is append-only';
  END IF;

  IF OLD.state <> 'draft' THEN
    IF OLD.manifest_id IS DISTINCT FROM NEW.manifest_id
       OR OLD.revision IS DISTINCT FROM NEW.revision
       OR OLD.schema_version IS DISTINCT FROM NEW.schema_version
       OR OLD.market_code IS DISTINCT FROM NEW.market_code
       OR OLD.locale IS DISTINCT FROM NEW.locale
       OR OLD.surface IS DISTINCT FROM NEW.surface
       OR OLD.min_app_version IS DISTINCT FROM NEW.min_app_version
       OR OLD.max_app_version IS DISTINCT FROM NEW.max_app_version
       OR OLD.starts_at IS DISTINCT FROM NEW.starts_at
       OR OLD.ends_at IS DISTINCT FROM NEW.ends_at
       OR OLD.ttl_seconds IS DISTINCT FROM NEW.ttl_seconds
       OR OLD.cache_policy IS DISTINCT FROM NEW.cache_policy
       OR OLD.targeting IS DISTINCT FROM NEW.targeting
       OR OLD.sections IS DISTINCT FROM NEW.sections
       OR OLD.asset_references IS DISTINCT FROM NEW.asset_references
       OR OLD.content_checksum IS DISTINCT FROM NEW.content_checksum
       OR OLD.signature IS DISTINCT FROM NEW.signature
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'published experience manifest payload is immutable';
    END IF;

    IF OLD.state = 'published' AND NEW.state NOT IN ('published', 'superseded', 'rolled_back') THEN
      RAISE EXCEPTION 'published experience manifest has an invalid lifecycle transition';
    END IF;
    IF OLD.state IN ('superseded', 'rolled_back') AND NEW.state NOT IN ('published', 'superseded', 'rolled_back') THEN
      RAISE EXCEPTION 'historical experience manifest has an invalid lifecycle transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_experience_manifest_immutable ON experience_manifest_revisions;
CREATE TRIGGER trg_experience_manifest_immutable
  BEFORE UPDATE OR DELETE ON experience_manifest_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_published_experience_manifest_mutation();

-- The audit trail is append-only and therefore cannot be erased to hide a
-- preview, publication or rollback decision.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_experience_manifest_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'experience_manifest_audit is append-only';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_experience_manifest_audit_immutable ON experience_manifest_audit;
CREATE TRIGGER trg_experience_manifest_audit_immutable
  BEFORE UPDATE OR DELETE ON experience_manifest_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_experience_manifest_audit_mutation();

GRANT SELECT, INSERT, UPDATE ON experience_manifest_revisions TO tembus_admin;
GRANT SELECT, INSERT ON experience_manifest_audit TO tembus_admin;

-- +goose Down
DROP TRIGGER IF EXISTS trg_experience_manifest_audit_immutable ON experience_manifest_audit;
DROP FUNCTION IF EXISTS prevent_experience_manifest_audit_mutation();
DROP TRIGGER IF EXISTS trg_experience_manifest_immutable ON experience_manifest_revisions;
DROP FUNCTION IF EXISTS prevent_published_experience_manifest_mutation();
DROP TABLE IF EXISTS experience_manifest_audit;
DROP TABLE IF EXISTS experience_manifest_revisions;
