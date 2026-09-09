-- +goose Up

-- APP-2026-011: emergency disable for a published presentation manifest.
-- This changes exposure only; it cannot mutate the immutable manifest payload.
ALTER TABLE experience_manifest_revisions
  ADD COLUMN IF NOT EXISTS kill_switch_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kill_switched_by UUID,
  ADD COLUMN IF NOT EXISTS kill_switched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kill_switch_reason VARCHAR(500);

ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_kill_switch_ck;

ALTER TABLE experience_manifest_revisions
  ADD CONSTRAINT experience_manifest_kill_switch_ck CHECK (
    (kill_switch_active = FALSE
      AND kill_switched_by IS NULL
      AND kill_switched_at IS NULL
      AND kill_switch_reason IS NULL)
    OR
    (kill_switch_active = TRUE
      AND kill_switched_by IS NOT NULL
      AND kill_switched_at IS NOT NULL
      AND kill_switch_reason IS NOT NULL
      AND length(btrim(kill_switch_reason)) BETWEEN 3 AND 500)
  );

ALTER TABLE experience_manifest_audit
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_check,
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_ck;

ALTER TABLE experience_manifest_audit
  ADD CONSTRAINT experience_manifest_audit_action_ck CHECK (
    action IN (
      'draft_created', 'draft_updated', 'previewed', 'approved', 'published',
      'superseded', 'rolled_back', 'kill_switched', 'kill_switch_cleared'
    )
  );

CREATE INDEX IF NOT EXISTS idx_experience_manifest_kill_switch
  ON experience_manifest_revisions (market_code, surface, state, kill_switch_active);

-- The existing immutability trigger intentionally does not compare the kill
-- switch columns: emergency disable/restore is the one audited exposure-only
-- mutation permitted on a published revision.
GRANT SELECT, UPDATE ON experience_manifest_revisions TO tembus_admin;

-- +goose Down
DROP INDEX IF EXISTS idx_experience_manifest_kill_switch;

ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_kill_switch_ck;

ALTER TABLE experience_manifest_audit
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_ck,
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_check;

ALTER TABLE experience_manifest_audit
  ADD CONSTRAINT experience_manifest_audit_action_ck CHECK (
    action IN ('draft_created', 'draft_updated', 'previewed', 'approved', 'published', 'superseded', 'rolled_back')
  );

ALTER TABLE experience_manifest_revisions
  DROP COLUMN IF EXISTS kill_switch_reason,
  DROP COLUMN IF EXISTS kill_switched_at,
  DROP COLUMN IF EXISTS kill_switched_by,
  DROP COLUMN IF EXISTS kill_switch_active;
