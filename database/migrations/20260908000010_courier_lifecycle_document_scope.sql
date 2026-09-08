-- +goose Up
-- COURIER-2026-012: a document can disable only the work it governs.
-- Existing documents default to '*' so legacy onboarding remains account-wide.

ALTER TABLE courier_documents
  ADD COLUMN IF NOT EXISTS service_scope TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[];

-- Normalize service scope at the database boundary. Empty/null input is the
-- legacy-safe wildcard; service identifiers are case-insensitive.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION normalize_courier_document_service_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  normalized TEXT[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT lower(trim(value)) ORDER BY lower(trim(value))), ARRAY['*']::TEXT[])
  INTO normalized
  FROM unnest(COALESCE(NEW.service_scope, ARRAY['*']::TEXT[])) AS scope_item(value)
  WHERE trim(value) <> '';

  IF normalized IS NULL OR cardinality(normalized) = 0 THEN
    normalized := ARRAY['*']::TEXT[];
  END IF;
  NEW.service_scope := normalized;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS courier_document_service_scope_normalizer ON courier_documents;
CREATE TRIGGER courier_document_service_scope_normalizer
BEFORE INSERT OR UPDATE OF service_scope ON courier_documents
FOR EACH ROW
EXECUTE FUNCTION normalize_courier_document_service_scope();

ALTER TABLE courier_documents
  DROP CONSTRAINT IF EXISTS courier_documents_service_scope_check,
  ADD CONSTRAINT courier_documents_service_scope_check
    CHECK (service_scope IS NOT NULL AND cardinality(service_scope) > 0);

CREATE INDEX IF NOT EXISTS idx_courier_documents_service_scope
  ON courier_documents USING GIN(service_scope)
  WHERE deleted_at IS NULL;

-- A NULL service means the account/onboarding gate. Only wildcard documents
-- affect that gate. A concrete service also matches its own scoped documents.
-- Required onboarding documents follow the same rule, so a service-only
-- document cannot accidentally make unrelated work ineligible.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_profile_documents_eligible_for_service(
  profile_id UUID,
  service_code_value TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  profile RECORD;
  required_count INTEGER;
  resolved_service TEXT := NULLIF(lower(trim(service_code_value)), '');
BEGIN
  SELECT onboarding_checklist INTO profile FROM courier_profiles WHERE id = profile_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF EXISTS (
    SELECT 1 FROM courier_documents document
    WHERE document.courier_id = profile_id
      AND document.deleted_at IS NULL
      AND (
        document.document_status IN ('expired', 'revoked', 'retention_expired')
        OR (document.document_status = 'verified' AND document.expires_at IS NOT NULL AND document.expires_at < CURRENT_DATE)
      )
      AND ('*' = ANY(document.service_scope)
        OR (resolved_service IS NOT NULL AND resolved_service = ANY(document.service_scope)))
  ) THEN RETURN FALSE; END IF;

  required_count := COALESCE(jsonb_array_length(profile.onboarding_checklist->'required_documents'), 0);
  IF required_count = 0 THEN RETURN TRUE; END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(profile.onboarding_checklist->'required_documents') AS required(doc_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM courier_documents document
      WHERE document.courier_id = profile_id
        AND document.doc_type = required.doc_type
        AND document.document_status = 'verified'
        AND document.deleted_at IS NULL
        AND (document.expires_at IS NULL OR document.expires_at >= CURRENT_DATE)
        AND document.revoked_at IS NULL
        AND (resolved_service IS NULL OR '*' = ANY(document.service_scope) OR resolved_service = ANY(document.service_scope))
    )
  );
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_profile_documents_eligible(profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT courier_profile_documents_eligible_for_service($1, NULL);
$$;
-- +goose StatementEnd

-- Capability matching is the server-side gate for concrete work. The current
-- market/enforcement checks remain authoritative and are intentionally kept.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_capability_is_eligible(
  profile_id UUID,
  service_code_value TEXT,
  market_code_value TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE resolved_market TEXT;
BEGIN
  SELECT COALESCE(NULLIF(market_code_value, ''), cp.market_code) INTO resolved_market
  FROM courier_profiles cp WHERE cp.id = profile_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM courier_service_capabilities csc
    WHERE csc.courier_profile_id = profile_id
      AND csc.service_code = service_code_value
      AND csc.status = 'enabled'
      AND (csc.effective_from IS NULL OR csc.effective_from <= CURRENT_DATE)
      AND (csc.expires_at IS NULL OR csc.expires_at >= CURRENT_DATE)
      AND ('*' = ANY(csc.market_scope) OR resolved_market IS NULL OR resolved_market = ANY(csc.market_scope))
      AND courier_profile_documents_eligible_for_service(profile_id, service_code_value)
      AND NOT courier_enforcement_is_active(profile_id, resolved_market, service_code_value)
  );
END;
$$;
-- +goose StatementEnd

CREATE OR REPLACE VIEW courier_capability_eligibility AS
SELECT
  csc.id, csc.courier_profile_id, csc.service_code, cp.market_code, csc.status,
  csc.certification_type, csc.certified_at, csc.effective_from, csc.expires_at,
  csc.market_scope, csc.suspension_reason, csc.eligibility_reason,
  CASE
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible_for_service(cp.id, csc.service_code) THEN 'documents_ineligible'
    WHEN csc.status = 'enabled' AND csc.effective_from IS NOT NULL AND csc.effective_from > CURRENT_DATE THEN 'not_yet_effective'
    WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL AND csc.expires_at < CURRENT_DATE THEN 'expired'
    WHEN csc.status = 'enabled' AND '*' <> ALL(csc.market_scope) AND cp.market_code IS NOT NULL AND cp.market_code <> ALL(csc.market_scope) THEN 'market_unavailable'
    ELSE csc.status
  END AS effective_status,
  CASE
    WHEN csc.status = 'paused' THEN COALESCE(csc.suspension_reason, csc.eligibility_reason, 'Capability dijeda oleh admin')
    WHEN csc.status = 'suspended' THEN COALESCE(csc.suspension_reason, csc.eligibility_reason, 'Capability disuspend oleh admin')
    WHEN csc.status = 'pending_review' THEN 'Menunggu sertifikasi dan review admin'
    WHEN csc.status = 'disabled' THEN 'Capability dinonaktifkan untuk sementara'
    WHEN csc.status = 'rejected' THEN COALESCE(csc.eligibility_reason, 'Sertifikasi capability ditolak')
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible_for_service(cp.id, csc.service_code) THEN 'Dokumen yang berlaku untuk capability ini tidak lagi memenuhi syarat'
    WHEN csc.status = 'enabled' AND csc.effective_from IS NOT NULL AND csc.effective_from > CURRENT_DATE THEN 'Sertifikasi belum memasuki masa berlaku'
    WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL AND csc.expires_at < CURRENT_DATE THEN 'Sertifikasi capability sudah kedaluwarsa'
    WHEN csc.status = 'enabled' AND '*' <> ALL(csc.market_scope) AND cp.market_code IS NOT NULL AND cp.market_code <> ALL(csc.market_scope) THEN 'Capability belum tersedia di market courier saat ini'
    ELSE NULL
  END AS availability_reason,
  CASE
    WHEN csc.status IN ('paused', 'suspended', 'disabled') THEN 'Hubungi admin untuk review atau minta capability diaktifkan kembali'
    WHEN csc.status IN ('pending_review', 'rejected') THEN 'Lengkapi bukti sertifikasi lalu kirim ulang untuk review admin'
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible_for_service(cp.id, csc.service_code) THEN 'Perbarui dokumen yang berlaku untuk capability ini sebelum mengaktifkannya kembali'
    WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL AND csc.expires_at < CURRENT_DATE THEN 'Unggah sertifikasi terbaru dan tunggu verifikasi admin'
    WHEN csc.status = 'enabled' AND '*' <> ALL(csc.market_scope) AND cp.market_code IS NOT NULL AND cp.market_code <> ALL(csc.market_scope) THEN 'Ajukan penambahan market scope kepada admin operasional'
    ELSE NULL
  END AS remediation_path,
  courier_capability_is_eligible(cp.id, csc.service_code, cp.market_code) AS is_eligible
FROM courier_service_capabilities csc
JOIN courier_profiles cp ON cp.id = csc.courier_profile_id;

-- Expiry/revocation of a scoped document pauses only affected capabilities.
-- Wildcard documents still pause every enabled capability, while onboarding and
-- account-level duty checks fail closed through the wildcard helper above.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION suspend_courier_for_invalid_document()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_status IN ('expired', 'revoked', 'retention_expired') THEN
    UPDATE courier_service_capabilities csc
    SET status = 'suspended',
        suspension_reason = format('Dokumen %s tidak lagi valid untuk capability %s', NEW.doc_type, csc.service_code),
        paused_at = COALESCE(csc.paused_at, NOW()),
        paused_by = NULL,
        updated_at = NOW()
    WHERE csc.courier_profile_id = NEW.courier_id
      AND csc.status = 'enabled'
      AND NOT courier_profile_documents_eligible_for_service(csc.courier_profile_id, csc.service_code);
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP INDEX IF EXISTS idx_courier_documents_service_scope;
DROP TRIGGER IF EXISTS courier_document_service_scope_normalizer ON courier_documents;
DROP TRIGGER IF EXISTS courier_document_eligibility_guard ON courier_documents;
DROP VIEW IF EXISTS courier_capability_eligibility;
DROP FUNCTION IF EXISTS normalize_courier_document_service_scope();
ALTER TABLE courier_documents
  DROP CONSTRAINT IF EXISTS courier_documents_service_scope_check,
  DROP COLUMN IF EXISTS service_scope;
DROP FUNCTION IF EXISTS courier_capability_is_eligible(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS courier_profile_documents_eligible(UUID);
DROP FUNCTION IF EXISTS courier_profile_documents_eligible_for_service(UUID, TEXT);
DROP FUNCTION IF EXISTS suspend_courier_for_invalid_document();

-- Restore the pre-012 account-wide document and capability contracts.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_profile_documents_eligible(profile_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE profile RECORD; required_count INTEGER;
BEGIN
  SELECT onboarding_checklist INTO profile FROM courier_profiles WHERE id = profile_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM courier_documents document WHERE document.courier_id = profile_id AND document.deleted_at IS NULL AND (document.document_status IN ('expired', 'revoked', 'retention_expired') OR (document.document_status = 'verified' AND document.expires_at IS NOT NULL AND document.expires_at < CURRENT_DATE))) THEN RETURN FALSE; END IF;
  required_count := COALESCE(jsonb_array_length(profile.onboarding_checklist->'required_documents'), 0);
  IF required_count = 0 THEN RETURN TRUE; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(profile.onboarding_checklist->'required_documents') AS required(doc_type) WHERE NOT EXISTS (SELECT 1 FROM courier_documents document WHERE document.courier_id = profile_id AND document.doc_type = required.doc_type AND document.document_status = 'verified' AND document.deleted_at IS NULL AND (document.expires_at IS NULL OR document.expires_at >= CURRENT_DATE) AND document.revoked_at IS NULL));
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_capability_is_eligible(profile_id UUID, service_code_value TEXT, market_code_value TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE resolved_market TEXT;
BEGIN
  SELECT COALESCE(NULLIF(market_code_value, ''), cp.market_code) INTO resolved_market FROM courier_profiles cp WHERE cp.id = profile_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN EXISTS (SELECT 1 FROM courier_service_capabilities csc WHERE csc.courier_profile_id = profile_id AND csc.service_code = service_code_value AND csc.status = 'enabled' AND (csc.effective_from IS NULL OR csc.effective_from <= CURRENT_DATE) AND (csc.expires_at IS NULL OR csc.expires_at >= CURRENT_DATE) AND ('*' = ANY(csc.market_scope) OR resolved_market IS NULL OR resolved_market = ANY(csc.market_scope)) AND courier_profile_documents_eligible(profile_id) AND NOT courier_enforcement_is_active(profile_id, resolved_market, service_code_value));
END;
$$;
-- +goose StatementEnd

CREATE OR REPLACE VIEW courier_capability_eligibility AS
SELECT csc.id, csc.courier_profile_id, csc.service_code, cp.market_code, csc.status,
  csc.certification_type, csc.certified_at, csc.effective_from, csc.expires_at, csc.market_scope,
  csc.suspension_reason, csc.eligibility_reason,
  CASE WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible(cp.id) THEN 'documents_ineligible'
       WHEN csc.status = 'enabled' AND csc.effective_from IS NOT NULL AND csc.effective_from > CURRENT_DATE THEN 'not_yet_effective'
       WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL AND csc.expires_at < CURRENT_DATE THEN 'expired'
       WHEN csc.status = 'enabled' AND '*' <> ALL(csc.market_scope) AND cp.market_code IS NOT NULL AND cp.market_code <> ALL(csc.market_scope) THEN 'market_unavailable'
       ELSE csc.status END AS effective_status,
  CASE WHEN csc.status = 'paused' THEN COALESCE(csc.suspension_reason, csc.eligibility_reason, 'Capability dijeda oleh admin')
       WHEN csc.status = 'suspended' THEN COALESCE(csc.suspension_reason, csc.eligibility_reason, 'Capability disuspend oleh admin')
       WHEN csc.status = 'pending_review' THEN 'Menunggu sertifikasi dan review admin'
       WHEN csc.status = 'disabled' THEN 'Capability dinonaktifkan untuk sementara'
       WHEN csc.status = 'rejected' THEN COALESCE(csc.eligibility_reason, 'Sertifikasi capability ditolak')
       WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible(cp.id) THEN 'Dokumen profil courier tidak lagi memenuhi syarat'
       WHEN csc.status = 'enabled' AND csc.effective_from IS NOT NULL AND csc.effective_from > CURRENT_DATE THEN 'Sertifikasi belum memasuki masa berlaku'
       WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL AND csc.expires_at < CURRENT_DATE THEN 'Sertifikasi capability sudah kedaluwarsa'
       WHEN csc.status = 'enabled' AND '*' <> ALL(csc.market_scope) AND cp.market_code IS NOT NULL AND cp.market_code <> ALL(csc.market_scope) THEN 'Capability belum tersedia di market courier saat ini'
       ELSE NULL END AS availability_reason,
  CASE WHEN csc.status IN ('paused', 'suspended', 'disabled') THEN 'Hubungi admin untuk review atau minta capability diaktifkan kembali'
       WHEN csc.status IN ('pending_review', 'rejected') THEN 'Lengkapi bukti sertifikasi lalu kirim ulang untuk review admin'
       WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible(cp.id) THEN 'Perbarui dokumen identitas yang expired/revoked sebelum mengaktifkan capability'
       WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL AND csc.expires_at < CURRENT_DATE THEN 'Unggah sertifikasi terbaru dan tunggu verifikasi admin'
       WHEN csc.status = 'enabled' AND '*' <> ALL(csc.market_scope) AND cp.market_code IS NOT NULL AND cp.market_code <> ALL(csc.market_scope) THEN 'Ajukan penambahan market scope kepada admin operasional'
       ELSE NULL END AS remediation_path,
  courier_capability_is_eligible(cp.id, csc.service_code, cp.market_code) AS is_eligible
FROM courier_service_capabilities csc JOIN courier_profiles cp ON cp.id = csc.courier_profile_id;

-- Restore the account-wide invalid-document trigger used before this gate.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION suspend_courier_for_invalid_document()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.document_status IN ('expired', 'revoked', 'retention_expired') THEN
    UPDATE courier_profiles
    SET onboarding_status = CASE WHEN onboarding_status = 'ACTIVE' THEN 'SUSPENDED' ELSE onboarding_status END,
        verification_status = CASE WHEN onboarding_status = 'ACTIVE' THEN 'suspended' ELSE verification_status END,
        status = CASE WHEN onboarding_status = 'ACTIVE' THEN 'suspended' ELSE status END,
        is_verified = CASE WHEN onboarding_status = 'ACTIVE' THEN FALSE ELSE is_verified END,
        updated_at = NOW()
    WHERE id = NEW.courier_id AND onboarding_status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd
