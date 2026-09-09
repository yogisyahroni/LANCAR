-- +goose Up
-- APP-2026-014: localized marketing/banner/help copy lives beside the
-- experience CMS, but protected legal/financial/consent material remains in
-- the approved market/compliance document paths.
CREATE TABLE IF NOT EXISTS localized_content_pack_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE RESTRICT,
  surface VARCHAR(32) NOT NULL CHECK (
    surface IN ('customer_android', 'customer_web', 'merchant_android', 'courier_android')
  ),
  pack_key VARCHAR(128) NOT NULL,
  content_kind VARCHAR(16) NOT NULL CHECK (content_kind IN ('marketing', 'banner', 'help')),
  locale VARCHAR(35) NOT NULL,
  value TEXT NOT NULL CHECK (char_length(btrim(value)) BETWEEN 1 AND 1000),
  revision INTEGER NOT NULL CHECK (revision > 0),
  content_checksum CHAR(64) NOT NULL CHECK (content_checksum ~ '^[a-f0-9]{64}$'),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
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
  CONSTRAINT localized_content_pack_key_ck CHECK (pack_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  CONSTRAINT localized_content_pack_locale_ck CHECK (
    locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),
  CONSTRAINT localized_content_pack_window_ck CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT localized_content_pack_revision_unique UNIQUE (market_code, surface, pack_key, locale, revision)
);

CREATE INDEX IF NOT EXISTS idx_localized_content_pack_resolution
  ON localized_content_pack_revisions (
    market_code, surface, pack_key, state, locale, effective_from
  );
CREATE UNIQUE INDEX IF NOT EXISTS uq_localized_content_pack_published
  ON localized_content_pack_revisions (market_code, surface, pack_key, locale)
  WHERE state = 'published';

CREATE TABLE IF NOT EXISTS localized_content_pack_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES localized_content_pack_revisions(id) ON DELETE RESTRICT,
  market_code VARCHAR(32) NOT NULL,
  surface VARCHAR(32) NOT NULL,
  pack_key VARCHAR(128) NOT NULL,
  locale VARCHAR(35) NOT NULL,
  revision INTEGER NOT NULL,
  action VARCHAR(24) NOT NULL CHECK (
    action IN ('draft_created', 'draft_updated', 'published', 'superseded', 'rolled_back')
  ),
  actor_id UUID,
  reason TEXT,
  correlation_id VARCHAR(128),
  previous_state VARCHAR(16),
  new_state VARCHAR(16) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_localized_content_pack_audit_history
  ON localized_content_pack_audit (market_code, surface, pack_key, locale, revision DESC, created_at DESC);

-- Published content is immutable. Publishing a new revision or rollback may
-- only change lifecycle/audit fields, never the copy, scope or checksum.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_published_localized_content_pack_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'localized content pack history is append-only';
  END IF;

  IF OLD.state <> 'draft' THEN
    IF OLD.market_code IS DISTINCT FROM NEW.market_code
       OR OLD.surface IS DISTINCT FROM NEW.surface
       OR OLD.pack_key IS DISTINCT FROM NEW.pack_key
       OR OLD.content_kind IS DISTINCT FROM NEW.content_kind
       OR OLD.locale IS DISTINCT FROM NEW.locale
       OR OLD.value IS DISTINCT FROM NEW.value
       OR OLD.revision IS DISTINCT FROM NEW.revision
       OR OLD.content_checksum IS DISTINCT FROM NEW.content_checksum
       OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
       OR OLD.effective_to IS DISTINCT FROM NEW.effective_to
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'published localized content pack payload is immutable';
    END IF;

    IF OLD.state = 'published' AND NEW.state NOT IN ('published', 'superseded', 'rolled_back') THEN
      RAISE EXCEPTION 'published localized content pack has an invalid lifecycle transition';
    END IF;
    IF OLD.state IN ('superseded', 'rolled_back') AND NEW.state NOT IN ('superseded', 'rolled_back') THEN
      RAISE EXCEPTION 'historical localized content pack has an invalid lifecycle transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_localized_content_pack_immutable ON localized_content_pack_revisions;
CREATE TRIGGER trg_localized_content_pack_immutable
  BEFORE UPDATE OR DELETE ON localized_content_pack_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_published_localized_content_pack_mutation();

-- Audit is append-only so publication history cannot be erased through the CMS.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_localized_content_pack_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'localized_content_pack_audit is append-only';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_localized_content_pack_audit_immutable ON localized_content_pack_audit;
CREATE TRIGGER trg_localized_content_pack_audit_immutable
  BEFORE UPDATE OR DELETE ON localized_content_pack_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_localized_content_pack_audit_mutation();

GRANT SELECT, INSERT, UPDATE ON localized_content_pack_revisions TO tembus_admin;
GRANT SELECT, INSERT ON localized_content_pack_audit TO tembus_admin;

-- +goose Down
DROP TRIGGER IF EXISTS trg_localized_content_pack_audit_immutable ON localized_content_pack_audit;
DROP FUNCTION IF EXISTS prevent_localized_content_pack_audit_mutation();
DROP TRIGGER IF EXISTS trg_localized_content_pack_immutable ON localized_content_pack_revisions;
DROP FUNCTION IF EXISTS prevent_published_localized_content_pack_mutation();
DROP TABLE IF EXISTS localized_content_pack_audit;
DROP TABLE IF EXISTS localized_content_pack_revisions;
