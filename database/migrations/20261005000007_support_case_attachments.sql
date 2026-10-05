-- +goose Up

-- MWEB-PORTAL-P0-008: restricted evidence for support cases.
-- The binary stays in the private upload store; this table is the
-- database-authoritative ownership, retention and audit metadata.
CREATE TABLE IF NOT EXISTS support_case_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  original_name VARCHAR(180) NOT NULL,
  content_type VARCHAR(80) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  checksum_sha256 CHAR(64) NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by_role VARCHAR(30) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, checksum_sha256)
);

CREATE INDEX IF NOT EXISTS idx_support_case_attachments_case
  ON support_case_attachments(case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_case_attachments_expiry
  ON support_case_attachments(expires_at);

GRANT SELECT, INSERT ON support_case_attachments TO tembus_admin;

-- +goose Down
REVOKE ALL ON support_case_attachments FROM tembus_admin;
DROP INDEX IF EXISTS idx_support_case_attachments_expiry;
DROP INDEX IF EXISTS idx_support_case_attachments_case;
DROP TABLE IF EXISTS support_case_attachments;
