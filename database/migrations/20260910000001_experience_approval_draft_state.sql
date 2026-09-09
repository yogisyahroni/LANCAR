-- +goose Up

-- ADMEXP-2026-015: distinguish an editable high-impact draft from a submitted
-- immutable approval candidate. Existing pending/approved candidates remain
-- locked; rejected candidates can be edited and must be explicitly resubmitted.
ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_approval_status_ck;

ALTER TABLE experience_manifest_revisions
  ADD CONSTRAINT experience_manifest_approval_status_ck CHECK (
    (requires_approval = FALSE AND approval_status = 'not_required')
    OR (requires_approval = TRUE AND approval_status IN ('draft', 'pending', 'approved', 'rejected'))
  );

-- +goose Down
-- Older deployments do not represent an editable approval draft. Map it to
-- pending before restoring the previous contract.
UPDATE experience_manifest_revisions
   SET approval_status = 'pending'
 WHERE requires_approval = TRUE
   AND approval_status = 'draft';

ALTER TABLE experience_manifest_revisions
  DROP CONSTRAINT IF EXISTS experience_manifest_approval_status_ck;

ALTER TABLE experience_manifest_revisions
  ADD CONSTRAINT experience_manifest_approval_status_ck CHECK (
    (requires_approval = FALSE AND approval_status = 'not_required')
    OR (requires_approval = TRUE AND approval_status IN ('pending', 'approved', 'rejected'))
  );
