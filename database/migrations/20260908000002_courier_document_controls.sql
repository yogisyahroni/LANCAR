-- +goose Up
-- COURIER-2026-002: document verification lifecycle, compliance storage metadata,
-- and idempotent reverification reminders.

ALTER TABLE courier_documents
  ADD COLUMN IF NOT EXISTS document_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS verification_source VARCHAR(40) NOT NULL DEFAULT 'manual_review',
  ADD COLUMN IF NOT EXISTS document_number VARCHAR(120),
  ADD COLUMN IF NOT EXISTS issued_at DATE,
  ADD COLUMN IF NOT EXISTS expires_at DATE,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revocation_reason TEXT,
  ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(40) NOT NULL DEFAULT 'private_filesystem',
  ADD COLUMN IF NOT EXISTS storage_key TEXT,
  ADD COLUMN IF NOT EXISTS storage_access_class VARCHAR(30) NOT NULL DEFAULT 'restricted',
  ADD COLUMN IF NOT EXISTS original_file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS checksum_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS retention_until DATE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE courier_documents
SET document_status = CASE WHEN COALESCE(is_verified, FALSE) THEN 'verified' ELSE 'pending_review' END
WHERE document_status = 'pending_review';

UPDATE courier_documents
SET storage_key = NULLIF(regexp_replace(COALESCE(file_url, ''), '^/uploads/', ''), ''),
    retention_until = COALESCE(retention_until, created_at::date + 1825)
WHERE storage_key IS NULL OR retention_until IS NULL;

ALTER TABLE courier_documents
  DROP CONSTRAINT IF EXISTS courier_documents_document_status_check,
  ADD CONSTRAINT courier_documents_document_status_check
    CHECK (document_status IN (
      'pending_review', 'verified', 'rejected', 'expired', 'revoked', 'retention_expired'
    )),
  DROP CONSTRAINT IF EXISTS courier_documents_storage_access_class_check,
  ADD CONSTRAINT courier_documents_storage_access_class_check
    CHECK (storage_access_class IN ('restricted', 'compliance_only')),
  DROP CONSTRAINT IF EXISTS courier_documents_retention_window_check,
  ADD CONSTRAINT courier_documents_retention_window_check
    CHECK (retention_until IS NULL OR retention_until >= created_at::date);

CREATE INDEX IF NOT EXISTS idx_courier_documents_eligibility
  ON courier_documents(courier_id, doc_type, document_status, expires_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_courier_documents_retention
  ON courier_documents(retention_until)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS courier_document_access_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_document_id UUID NOT NULL REFERENCES courier_documents(id) ON DELETE CASCADE,
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL CHECK (action IN ('view', 'verify', 'reject', 'revoke', 'retention_expire')),
  purpose VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_document_access_log_document
  ON courier_document_access_log(courier_document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS courier_document_reverification_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_document_id UUID NOT NULL REFERENCES courier_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_type VARCHAR(30) NOT NULL CHECK (reminder_type IN ('expiry_30d', 'expiry_7d', 'expiry_day')),
  scheduled_for DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (courier_document_id, reminder_type, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_courier_document_reminders_pending
  ON courier_document_reverification_reminders(status, scheduled_for)
  WHERE status <> 'sent';

-- A document may be eligible only while it is verified, retained, and unexpired.
-- Profiles with no resolved document policy remain compatible with legacy active
-- rows; new onboarding checklists always include required_documents.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_profile_documents_eligible(profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  profile RECORD;
  required_count INTEGER;
BEGIN
  SELECT onboarding_checklist
  INTO profile
  FROM courier_profiles
  WHERE id = profile_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM courier_documents document
    WHERE document.courier_id = profile_id
      AND document.deleted_at IS NULL
      AND (
        document.document_status IN ('expired', 'revoked', 'retention_expired')
        OR (document.document_status = 'verified'
            AND document.expires_at IS NOT NULL
            AND document.expires_at < CURRENT_DATE)
      )
  ) THEN
    RETURN FALSE;
  END IF;

  required_count := COALESCE(jsonb_array_length(profile.onboarding_checklist->'required_documents'), 0);
  IF required_count = 0 THEN
    RETURN TRUE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(profile.onboarding_checklist->'required_documents') AS required(doc_type)
    WHERE NOT EXISTS (
      SELECT 1
      FROM courier_documents document
      WHERE document.courier_id = profile_id
        AND document.doc_type = required.doc_type
        AND document.document_status = 'verified'
        AND document.deleted_at IS NULL
        AND (document.expires_at IS NULL OR document.expires_at >= CURRENT_DATE)
        AND document.revoked_at IS NULL
    )
  );
END;
$$;
-- +goose StatementEnd

CREATE OR REPLACE VIEW courier_document_eligibility AS
SELECT
  cd.id,
  cd.courier_id,
  cd.doc_type,
  cd.document_status,
  cd.verification_source,
  cd.issued_at,
  cd.expires_at,
  cd.revoked_at,
  cd.storage_provider,
  cd.storage_key,
  cd.storage_access_class,
  cd.retention_until,
  cd.deleted_at,
  CASE
    WHEN cd.deleted_at IS NOT NULL THEN 'retention_expired'
    WHEN cd.document_status = 'revoked' THEN 'revoked'
    WHEN cd.document_status = 'verified' AND cd.expires_at IS NOT NULL AND cd.expires_at < CURRENT_DATE THEN 'expired'
    ELSE cd.document_status
  END AS effective_status,
  (
    cd.document_status = 'verified'
    AND cd.deleted_at IS NULL
    AND cd.revoked_at IS NULL
    AND (cd.expires_at IS NULL OR cd.expires_at >= CURRENT_DATE)
  ) AS eligible
FROM courier_documents cd;

-- Keep the legacy is_verified column and the canonical document status in sync,
-- while making expiry/revocation a server-side policy decision.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION normalize_courier_document_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.document_status := 'retention_expired';
    NEW.is_verified := FALSE;
  ELSIF NEW.document_status = 'verified'
        AND NEW.expires_at IS NOT NULL
        AND NEW.expires_at < CURRENT_DATE THEN
    NEW.document_status := 'expired';
    NEW.is_verified := FALSE;
  ELSIF NEW.document_status = 'verified' THEN
    NEW.is_verified := TRUE;
    NEW.verified_at := COALESCE(NEW.verified_at, NOW());
  ELSIF COALESCE(NEW.is_verified, FALSE) = TRUE
        AND NEW.document_status = 'pending_review' THEN
    NEW.document_status := 'verified';
    NEW.verified_at := COALESCE(NEW.verified_at, NOW());
  ELSE
    NEW.is_verified := FALSE;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS courier_document_status_normalizer ON courier_documents;
CREATE TRIGGER courier_document_status_normalizer
BEFORE INSERT OR UPDATE OF document_status, is_verified, expires_at, revoked_at, deleted_at
ON courier_documents
FOR EACH ROW
EXECUTE FUNCTION normalize_courier_document_status();

-- Revocation/expiry immediately removes an active courier from eligibility. A
-- replacement document still requires an explicit server-side reactivation.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION suspend_courier_for_invalid_document()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_status IN ('expired', 'revoked', 'retention_expired') THEN
    UPDATE courier_profiles
    SET onboarding_status = CASE
          WHEN onboarding_status = 'ACTIVE' THEN 'SUSPENDED'
          ELSE onboarding_status
        END,
        verification_status = CASE
          WHEN onboarding_status = 'ACTIVE' THEN 'suspended'
          ELSE verification_status
        END,
        status = CASE
          WHEN onboarding_status = 'ACTIVE' THEN 'suspended'
          ELSE status
        END,
        is_verified = CASE
          WHEN onboarding_status = 'ACTIVE' THEN FALSE
          ELSE is_verified
        END,
        updated_at = NOW()
    WHERE id = NEW.courier_id
      AND onboarding_status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS courier_document_eligibility_guard ON courier_documents;
CREATE TRIGGER courier_document_eligibility_guard
AFTER INSERT OR UPDATE OF document_status, expires_at, revoked_at, deleted_at
ON courier_documents
FOR EACH ROW
EXECUTE FUNCTION suspend_courier_for_invalid_document();

-- +goose Down
DROP VIEW IF EXISTS courier_document_eligibility;
DROP TRIGGER IF EXISTS courier_document_eligibility_guard ON courier_documents;
DROP TRIGGER IF EXISTS courier_document_status_normalizer ON courier_documents;
DROP FUNCTION IF EXISTS suspend_courier_for_invalid_document();
DROP FUNCTION IF EXISTS normalize_courier_document_status();
DROP FUNCTION IF EXISTS courier_profile_documents_eligible(UUID);
DROP INDEX IF EXISTS idx_courier_document_reminders_pending;
DROP TABLE IF EXISTS courier_document_reverification_reminders;
DROP INDEX IF EXISTS idx_courier_document_access_log_document;
DROP TABLE IF EXISTS courier_document_access_log;
DROP INDEX IF EXISTS idx_courier_documents_retention;
DROP INDEX IF EXISTS idx_courier_documents_eligibility;
ALTER TABLE courier_documents
  DROP CONSTRAINT IF EXISTS courier_documents_retention_window_check,
  DROP CONSTRAINT IF EXISTS courier_documents_storage_access_class_check,
  DROP CONSTRAINT IF EXISTS courier_documents_document_status_check,
  DROP COLUMN IF EXISTS uploaded_by,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS retention_until,
  DROP COLUMN IF EXISTS checksum_sha256,
  DROP COLUMN IF EXISTS mime_type,
  DROP COLUMN IF EXISTS original_file_name,
  DROP COLUMN IF EXISTS storage_access_class,
  DROP COLUMN IF EXISTS storage_key,
  DROP COLUMN IF EXISTS storage_provider,
  DROP COLUMN IF EXISTS revocation_reason,
  DROP COLUMN IF EXISTS revoked_at,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS issued_at,
  DROP COLUMN IF EXISTS document_number,
  DROP COLUMN IF EXISTS verification_source,
  DROP COLUMN IF EXISTS document_status;
