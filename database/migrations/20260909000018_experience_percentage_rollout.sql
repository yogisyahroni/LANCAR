-- +goose Up

-- ADMEXP-2026-006: percentage rollout is part of the immutable exposure
-- policy for a manifest revision.  A missing value on older rows is upgraded
-- to 100%, preserving the existing public behavior.
ALTER TABLE experience_manifest_revisions
  ADD COLUMN IF NOT EXISTS rollout_percentage SMALLINT NOT NULL DEFAULT 100;

ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_rollout_percentage_ck;

ALTER TABLE experience_manifest_revisions
  ADD CONSTRAINT experience_manifest_rollout_percentage_ck
  CHECK (rollout_percentage BETWEEN 0 AND 100);

-- Keep rollout policy immutable after publication.  The kill-switch columns
-- remain the only exposure-only mutation permitted on a published row.
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
       OR OLD.rollout_stage IS DISTINCT FROM NEW.rollout_stage
       OR OLD.canary_cohort IS DISTINCT FROM NEW.canary_cohort
       OR OLD.rollout_percentage IS DISTINCT FROM NEW.rollout_percentage
       OR OLD.requires_approval IS DISTINCT FROM NEW.requires_approval
       OR OLD.approval_status IS DISTINCT FROM NEW.approval_status
       OR OLD.approval_requested_by IS DISTINCT FROM NEW.approval_requested_by
       OR OLD.approval_requested_at IS DISTINCT FROM NEW.approval_requested_at
       OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
       OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
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

CREATE INDEX IF NOT EXISTS idx_experience_manifest_percentage_rollout
  ON experience_manifest_revisions (market_code, surface, rollout_percentage, state);

-- +goose Down
DROP INDEX IF EXISTS idx_experience_manifest_percentage_rollout;
ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_rollout_percentage_ck;

-- Restore the pre-percentage immutable payload guard before removing the
-- column referenced by the newer function body.
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
       OR OLD.rollout_stage IS DISTINCT FROM NEW.rollout_stage
       OR OLD.canary_cohort IS DISTINCT FROM NEW.canary_cohort
       OR OLD.requires_approval IS DISTINCT FROM NEW.requires_approval
       OR OLD.approval_status IS DISTINCT FROM NEW.approval_status
       OR OLD.approval_requested_by IS DISTINCT FROM NEW.approval_requested_by
       OR OLD.approval_requested_at IS DISTINCT FROM NEW.approval_requested_at
       OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
       OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
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
  DROP COLUMN IF EXISTS rollout_percentage;
