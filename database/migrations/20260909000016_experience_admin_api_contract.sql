-- +goose Up

-- ADMEXP-2026-003: complete the explicit CMS approval lifecycle. Rejection is
-- still a draft-only state; the next submit or draft edit must return it to
-- pending before a checker can approve it.
ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_approval_status_ck;

ALTER TABLE experience_manifest_revisions
  ADD CONSTRAINT experience_manifest_approval_status_ck CHECK (
    (requires_approval = FALSE AND approval_status = 'not_required')
    OR (requires_approval = TRUE AND approval_status IN ('pending', 'approved', 'rejected'))
  );

ALTER TABLE experience_manifest_audit
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_check,
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_ck;

ALTER TABLE experience_manifest_audit
  ADD CONSTRAINT experience_manifest_audit_action_ck CHECK (
    action IN (
      'draft_created', 'draft_updated', 'previewed', 'approval_requested',
      'approved', 'rejected', 'published', 'superseded', 'rolled_back',
      'kill_switched', 'kill_switch_cleared'
    )
  );

-- +goose Down
-- Rejected drafts are mapped back to the previous representable state before
-- restoring the older constraint.
UPDATE experience_manifest_revisions
   SET approval_status = 'pending'
 WHERE requires_approval = TRUE
   AND approval_status = 'rejected';

ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_approval_status_ck;

ALTER TABLE experience_manifest_revisions
  ADD CONSTRAINT experience_manifest_approval_status_ck CHECK (
    (requires_approval = FALSE AND approval_status = 'not_required')
    OR (requires_approval = TRUE AND approval_status IN ('pending', 'approved'))
  );

ALTER TABLE experience_manifest_audit
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_ck,
  DROP CONSTRAINT IF EXISTS experience_manifest_audit_action_check;

ALTER TABLE experience_manifest_audit
  ADD CONSTRAINT experience_manifest_audit_action_check CHECK (
    action IN ('draft_created', 'draft_updated', 'previewed', 'approved', 'published', 'superseded', 'rolled_back')
  );
