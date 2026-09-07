-- +goose Up
-- COURIER-2026-003: capability certification, market scope, validity window,
-- independent pause/suspension, and server-side matching policy.

ALTER TABLE courier_service_capabilities
  ADD COLUMN IF NOT EXISTS certification_type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS evidence_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS evidence_checksum_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS certified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS expires_at DATE,
  ADD COLUMN IF NOT EXISTS market_scope TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[],
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_by UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE courier_service_capabilities
SET effective_from = COALESCE(effective_from, created_at::date),
    certified_at = COALESCE(certified_at, approved_at),
    market_scope = COALESCE(NULLIF(market_scope, '{}'::text[]), ARRAY['*']::text[])
WHERE effective_from IS NULL
   OR market_scope IS NULL
   OR cardinality(market_scope) = 0;

ALTER TABLE courier_service_capabilities
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_status_check,
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_status_check_2026,
  ADD CONSTRAINT courier_service_capabilities_status_check_2026
    CHECK (status IN ('pending_review', 'enabled', 'disabled', 'rejected', 'paused', 'suspended')),
  ADD CONSTRAINT courier_service_capabilities_effective_window_check_2026
    CHECK (expires_at IS NULL OR effective_from IS NULL OR expires_at >= effective_from),
  ADD CONSTRAINT courier_service_capabilities_market_scope_check_2026
    CHECK (market_scope IS NOT NULL AND cardinality(market_scope) > 0);

CREATE INDEX IF NOT EXISTS idx_courier_capabilities_policy
  ON courier_service_capabilities(courier_profile_id, service_code, status, effective_from, expires_at)
  WHERE status = 'enabled';

CREATE INDEX IF NOT EXISTS idx_courier_capabilities_market_scope
  ON courier_service_capabilities USING GIN(market_scope);

-- Matching must consult this function rather than trusting an app-provided
-- capability toggle. It also protects older matching callers that only check
-- status = 'enabled'.
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
DECLARE
  resolved_market TEXT;
BEGIN
  SELECT COALESCE(NULLIF(market_code_value, ''), cp.market_code)
  INTO resolved_market
  FROM courier_profiles cp
  WHERE cp.id = profile_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM courier_service_capabilities csc
    WHERE csc.courier_profile_id = profile_id
      AND csc.service_code = service_code_value
      AND csc.status = 'enabled'
      AND (csc.effective_from IS NULL OR csc.effective_from <= CURRENT_DATE)
      AND (csc.expires_at IS NULL OR csc.expires_at >= CURRENT_DATE)
      AND (
        '*' = ANY(csc.market_scope)
        OR resolved_market IS NULL
        OR resolved_market = ANY(csc.market_scope)
      )
      AND courier_profile_documents_eligible(profile_id)
  );
END;
$$;
-- +goose StatementEnd

CREATE OR REPLACE VIEW courier_capability_eligibility AS
SELECT
  csc.id,
  csc.courier_profile_id,
  csc.service_code,
  cp.market_code,
  csc.status,
  csc.certification_type,
  csc.certified_at,
  csc.effective_from,
  csc.expires_at,
  csc.market_scope,
  csc.suspension_reason,
  csc.eligibility_reason,
  CASE
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible(cp.id)
      THEN 'documents_ineligible'
    WHEN csc.status = 'enabled' AND csc.effective_from IS NOT NULL
         AND csc.effective_from > CURRENT_DATE
      THEN 'not_yet_effective'
    WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL
         AND csc.expires_at < CURRENT_DATE
      THEN 'expired'
    WHEN csc.status = 'enabled'
         AND '*' <> ALL(csc.market_scope)
         AND cp.market_code IS NOT NULL
         AND cp.market_code <> ALL(csc.market_scope)
      THEN 'market_unavailable'
    ELSE csc.status
  END AS effective_status,
  CASE
    WHEN csc.status = 'paused' THEN COALESCE(csc.suspension_reason, csc.eligibility_reason, 'Capability dijeda oleh admin')
    WHEN csc.status = 'suspended' THEN COALESCE(csc.suspension_reason, csc.eligibility_reason, 'Capability disuspend oleh admin')
    WHEN csc.status = 'pending_review' THEN 'Menunggu sertifikasi dan review admin'
    WHEN csc.status = 'disabled' THEN 'Capability dinonaktifkan untuk sementara'
    WHEN csc.status = 'rejected' THEN COALESCE(csc.eligibility_reason, 'Sertifikasi capability ditolak')
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible(cp.id)
      THEN 'Dokumen profil courier tidak lagi memenuhi syarat'
    WHEN csc.status = 'enabled' AND csc.effective_from IS NOT NULL
         AND csc.effective_from > CURRENT_DATE
      THEN 'Sertifikasi belum memasuki masa berlaku'
    WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL
         AND csc.expires_at < CURRENT_DATE
      THEN 'Sertifikasi capability sudah kedaluwarsa'
    WHEN csc.status = 'enabled'
         AND '*' <> ALL(csc.market_scope)
         AND cp.market_code IS NOT NULL
         AND cp.market_code <> ALL(csc.market_scope)
      THEN 'Capability belum tersedia di market courier saat ini'
    ELSE NULL
  END AS availability_reason,
  CASE
    WHEN csc.status IN ('paused', 'suspended', 'disabled')
      THEN 'Hubungi admin untuk review atau minta capability diaktifkan kembali'
    WHEN csc.status IN ('pending_review', 'rejected')
      THEN 'Lengkapi bukti sertifikasi lalu kirim ulang untuk review admin'
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible(cp.id)
      THEN 'Perbarui dokumen identitas yang expired/revoked sebelum mengaktifkan capability'
    WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL
         AND csc.expires_at < CURRENT_DATE
      THEN 'Unggah sertifikasi terbaru dan tunggu verifikasi admin'
    WHEN csc.status = 'enabled'
         AND '*' <> ALL(csc.market_scope)
         AND cp.market_code IS NOT NULL
         AND cp.market_code <> ALL(csc.market_scope)
      THEN 'Ajukan penambahan market scope kepada admin operasional'
    ELSE NULL
  END AS remediation_path,
  courier_capability_is_eligible(cp.id, csc.service_code, cp.market_code) AS is_eligible
FROM courier_service_capabilities csc
JOIN courier_profiles cp ON cp.id = csc.courier_profile_id;

-- +goose Down
DROP VIEW IF EXISTS courier_capability_eligibility;
DROP FUNCTION IF EXISTS courier_capability_is_eligible(UUID, TEXT, TEXT);
DROP INDEX IF EXISTS idx_courier_capabilities_market_scope;
DROP INDEX IF EXISTS idx_courier_capabilities_policy;
ALTER TABLE courier_service_capabilities
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_market_scope_check_2026,
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_effective_window_check_2026,
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_status_check_2026,
  DROP COLUMN IF EXISTS paused_by,
  DROP COLUMN IF EXISTS paused_at,
  DROP COLUMN IF EXISTS suspension_reason,
  DROP COLUMN IF EXISTS market_scope,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS effective_from,
  DROP COLUMN IF EXISTS certified_at,
  DROP COLUMN IF EXISTS evidence_checksum_sha256,
  DROP COLUMN IF EXISTS evidence_storage_key,
  DROP COLUMN IF EXISTS certification_type;
