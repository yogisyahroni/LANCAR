-- +goose Up

-- MWEB-PORTAL-P0-008: support evidence moderation is an explicit Admin
-- decision. Pending/rejected evidence is not downloadable by other parties.
ALTER TABLE support_case_attachments
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

ALTER TABLE support_case_attachments
  DROP CONSTRAINT IF EXISTS support_case_attachments_moderation_status_check;

ALTER TABLE support_case_attachments
  ADD CONSTRAINT support_case_attachments_moderation_status_check CHECK (
    moderation_status IN ('pending', 'approved', 'rejected')
  );

CREATE INDEX IF NOT EXISTS idx_support_case_attachments_moderation
  ON support_case_attachments(case_id, moderation_status, created_at);

GRANT UPDATE ON support_case_attachments TO tembus_admin;

-- +goose Down
DROP INDEX IF EXISTS idx_support_case_attachments_moderation;
ALTER TABLE support_case_attachments
  DROP CONSTRAINT IF EXISTS support_case_attachments_moderation_status_check,
  DROP COLUMN IF EXISTS moderated_at,
  DROP COLUMN IF EXISTS moderated_by,
  DROP COLUMN IF EXISTS moderation_reason,
  DROP COLUMN IF EXISTS moderation_status;
