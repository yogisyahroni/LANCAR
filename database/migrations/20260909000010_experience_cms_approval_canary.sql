-- +goose Up

-- APP-2026-009: keep CMS approval and canary state in the existing experience
-- manifest boundary. A canary is a published revision visible only to its
-- explicit test cohort; a broad/untargeted revision requires maker-checker
-- approval before publication.
ALTER TABLE experience_manifest_revisions
  ADD COLUMN IF NOT EXISTS rollout_stage VARCHAR(16) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS canary_cohort VARCHAR(128),
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(24) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approval_requested_by UUID,
  ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_rollout_stage_ck,
  DROP CONSTRAINT IF EXISTS experience_manifest_canary_cohort_ck,
  DROP CONSTRAINT IF EXISTS experience_manifest_approval_status_ck,
  DROP CONSTRAINT IF EXISTS experience_manifest_approval_actor_ck;

ALTER TABLE experience_manifest_revisions
  ADD CONSTRAINT experience_manifest_rollout_stage_ck CHECK (rollout_stage IN ('canary', 'public')),
  ADD CONSTRAINT experience_manifest_canary_cohort_ck CHECK (
    (rollout_stage = 'canary' AND canary_cohort IS NOT NULL)
    OR (rollout_stage = 'public' AND canary_cohort IS NULL)
  ),
  ADD CONSTRAINT experience_manifest_approval_status_ck CHECK (
    (requires_approval = FALSE AND approval_status = 'not_required')
    OR (requires_approval = TRUE AND approval_status IN ('pending', 'approved'))
  ),
  ADD CONSTRAINT experience_manifest_approval_actor_ck CHECK (
    approval_status <> 'approved'
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS DISTINCT FROM created_by)
  );

ALTER TABLE experience_manifest_audit
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_check,
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_ck;

ALTER TABLE experience_manifest_audit
  ADD CONSTRAINT experience_manifest_audit_action_ck CHECK (
    action IN ('draft_created', 'draft_updated', 'previewed', 'approved', 'published', 'superseded', 'rolled_back')
  );

-- Include all fields that can affect audience visibility or publication
-- eligibility in the append-only payload guard.
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

CREATE INDEX IF NOT EXISTS idx_experience_manifest_rollout
  ON experience_manifest_revisions (market_code, surface, state, rollout_stage, canary_cohort);

-- +goose Down
DROP INDEX IF EXISTS idx_experience_manifest_rollout;

ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_rollout_stage_ck,
  DROP CONSTRAINT IF EXISTS experience_manifest_canary_cohort_ck,
  DROP CONSTRAINT IF EXISTS experience_manifest_approval_status_ck,
  DROP CONSTRAINT IF EXISTS experience_manifest_approval_actor_ck;

ALTER TABLE experience_manifest_audit
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_ck;

ALTER TABLE experience_manifest_audit
  ADD CONSTRAINT experience_manifest_audit_action_check CHECK (
    action IN ('draft_created', 'draft_updated', 'previewed', 'published', 'superseded', 'rolled_back')
  );

-- Restore the APP-2026-008 trigger body before removing the columns it now
-- references, preserving schedule immutability on older deployments.
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

ALTER TABLE experience_manifest_revisions
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS approval_requested_at,
  DROP COLUMN IF EXISTS approval_requested_by,
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS requires_approval,
  DROP COLUMN IF EXISTS canary_cohort,
  DROP COLUMN IF EXISTS rollout_stage;
