-- +goose Up

-- APP-2026-008: retain the IANA timezone used when an experience schedule was
-- authored. starts_at/ends_at remain TIMESTAMPTZ instants for unambiguous
-- server-side resolution and DST-safe operation.
ALTER TABLE experience_manifest_revisions
  ADD COLUMN IF NOT EXISTS schedule_timezone VARCHAR(64) NOT NULL DEFAULT 'UTC';

ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_schedule_timezone_ck;

ALTER TABLE experience_manifest_revisions
  ADD CONSTRAINT experience_manifest_schedule_timezone_ck CHECK (
    schedule_timezone ~ '^[A-Za-z0-9_+.-]+(/[A-Za-z0-9_+.-]+)*$'
  );

-- Extend the existing immutable-payload trigger to cover the new schedule
-- metadata. Historical revisions must not be changed after publication.
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
       OR OLD.schedule_timezone IS DISTINCT FROM NEW.schedule_timezone
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

CREATE INDEX IF NOT EXISTS idx_experience_manifest_schedule_timezone
  ON experience_manifest_revisions (schedule_timezone);

-- +goose Down
DROP INDEX IF EXISTS idx_experience_manifest_schedule_timezone;
ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_schedule_timezone_ck;

-- Restore the APP-2026-001 trigger body before removing the column it now
-- references, keeping the previous rollback shape intact.
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

ALTER TABLE experience_manifest_revisions
  DROP COLUMN IF EXISTS schedule_timezone;
