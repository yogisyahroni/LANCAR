-- +goose Up
-- GLOB-2026-003: market/role-scoped compliance policy boundary.
--
-- This migration deliberately keeps compliance policy in the existing
-- configuration/database ownership boundary. It does not copy document
-- contents or provider credentials into policy tables. Sensitive artifacts
-- remain owned by their source domain (courier/merchant) and are governed by
-- the access/retention policy recorded here.

CREATE TABLE IF NOT EXISTS market_compliance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE CASCADE,
  role_code VARCHAR(16) NOT NULL,
  requirement_code VARCHAR(64) NOT NULL,
  requirement_kind VARCHAR(20) NOT NULL,
  document_type VARCHAR(64),
  document_version VARCHAR(64),
  locale VARCHAR(35) NOT NULL,
  purpose VARCHAR(120) NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  policy_version VARCHAR(80) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_compliance_requirements_role_ck
    CHECK (role_code IN ('customer', 'courier', 'merchant')),
  CONSTRAINT market_compliance_requirements_kind_ck
    CHECK (requirement_kind IN ('identity', 'document', 'consent', 'screening')),
  CONSTRAINT market_compliance_requirements_consent_fields_ck
    CHECK (requirement_kind <> 'consent' OR (document_type IS NOT NULL AND document_version IS NOT NULL)),
  CONSTRAINT market_compliance_requirements_effective_ck
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT market_compliance_requirements_metadata_object_ck
    CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (market_code, role_code, requirement_code, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_market_compliance_requirements_lookup
  ON market_compliance_requirements (market_code, role_code, effective_from DESC)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS market_compliance_data_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE CASCADE,
  data_class VARCHAR(32) NOT NULL,
  retention_days INTEGER NOT NULL,
  export_mode VARCHAR(20) NOT NULL,
  deletion_mode VARCHAR(24) NOT NULL,
  policy_version VARCHAR(80) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  legal_basis VARCHAR(120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_compliance_data_policies_class_ck
    CHECK (data_class IN ('identity', 'verification_artifact', 'consent', 'operational')),
  CONSTRAINT market_compliance_data_policies_retention_ck
    CHECK (retention_days BETWEEN 1 AND 36500),
  CONSTRAINT market_compliance_data_policies_export_ck
    CHECK (export_mode IN ('allowed', 'limited', 'prohibited')),
  CONSTRAINT market_compliance_data_policies_deletion_ck
    CHECK (deletion_mode IN ('delete', 'anonymize', 'retain_legal_hold')),
  CONSTRAINT market_compliance_data_policies_effective_ck
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT market_compliance_data_policies_metadata_object_ck
    CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (market_code, data_class, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_market_compliance_data_policies_lookup
  ON market_compliance_data_policies (market_code, data_class, effective_from DESC)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS market_compliance_artifact_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE CASCADE,
  role_code VARCHAR(16) NOT NULL,
  artifact_type VARCHAR(64) NOT NULL,
  storage_access_class VARCHAR(24) NOT NULL,
  retention_days INTEGER NOT NULL,
  export_mode VARCHAR(20) NOT NULL,
  deletion_mode VARCHAR(24) NOT NULL,
  policy_version VARCHAR(80) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_compliance_artifact_policies_role_ck
    CHECK (role_code IN ('customer', 'courier', 'merchant')),
  CONSTRAINT market_compliance_artifact_policies_access_ck
    CHECK (storage_access_class IN ('restricted', 'compliance_only')),
  CONSTRAINT market_compliance_artifact_policies_retention_ck
    CHECK (retention_days BETWEEN 1 AND 36500),
  CONSTRAINT market_compliance_artifact_policies_export_ck
    CHECK (export_mode IN ('allowed', 'limited', 'prohibited')),
  CONSTRAINT market_compliance_artifact_policies_deletion_ck
    CHECK (deletion_mode IN ('delete', 'anonymize', 'retain_legal_hold')),
  CONSTRAINT market_compliance_artifact_policies_effective_ck
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT market_compliance_artifact_policies_metadata_object_ck
    CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (market_code, role_code, artifact_type, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_market_compliance_artifact_policies_lookup
  ON market_compliance_artifact_policies (market_code, role_code, artifact_type, effective_from DESC)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS market_compliance_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL,
  subject_role VARCHAR(16) NOT NULL,
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE RESTRICT,
  requirement_code VARCHAR(64) NOT NULL,
  document_type VARCHAR(64) NOT NULL,
  document_version VARCHAR(64) NOT NULL,
  locale VARCHAR(35) NOT NULL,
  purpose VARCHAR(120) NOT NULL,
  decision VARCHAR(12) NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID NOT NULL,
  actor_type VARCHAR(16) NOT NULL DEFAULT 'self',
  source VARCHAR(32) NOT NULL DEFAULT 'api',
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT market_compliance_consent_events_role_ck
    CHECK (subject_role IN ('customer', 'courier', 'merchant')),
  CONSTRAINT market_compliance_consent_events_decision_ck
    CHECK (decision IN ('granted', 'withdrawn')),
  CONSTRAINT market_compliance_consent_events_actor_type_ck
    CHECK (actor_type IN ('self', 'admin', 'system')),
  CONSTRAINT market_compliance_consent_events_metadata_object_ck
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_market_compliance_consent_events_subject
  ON market_compliance_consent_events (subject_id, subject_role, market_code, consented_at DESC);

-- A consent event is an audit record. Corrections are represented by a new
-- event (withdrawn/granted), never by overwriting the original timestamp or
-- actor. The API idempotency boundary protects request replay; no unique
-- "active grant" index is used because withdrawal followed by re-grant must
-- remain representable without mutating historical events.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_market_compliance_consent_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'market_compliance_consent_events is append-only';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_market_compliance_consent_immutable ON market_compliance_consent_events;
CREATE TRIGGER trg_market_compliance_consent_immutable
  BEFORE UPDATE OR DELETE ON market_compliance_consent_events
  FOR EACH ROW EXECUTE FUNCTION prevent_market_compliance_consent_mutation();

-- Baseline policy for the existing Indonesia/Jakarta market. These are
-- explicit configuration records and can be replaced by an approved market
-- policy revision; no other market inherits them implicitly.
INSERT INTO market_compliance_requirements (
  market_code, role_code, requirement_code, requirement_kind,
  document_type, document_version, locale, purpose, policy_version
)
VALUES
  ('id-jk', 'customer', 'customer_identity', 'identity', NULL, NULL, 'id-ID', 'account_access', 'compliance-id-jk-v1'),
  ('id-jk', 'customer', 'terms_of_service', 'consent', 'terms', 'terms-id-jk-v1', 'id-ID', 'service_access', 'compliance-id-jk-v1'),
  ('id-jk', 'customer', 'privacy_notice', 'consent', 'privacy', 'privacy-id-jk-v1', 'id-ID', 'data_processing', 'compliance-id-jk-v1'),
  ('id-jk', 'courier', 'government_identity', 'document', 'ktp', NULL, 'id-ID', 'courier_onboarding', 'compliance-id-jk-v1'),
  ('id-jk', 'courier', 'vehicle_eligibility', 'document', 'stnk', NULL, 'id-ID', 'courier_onboarding', 'compliance-id-jk-v1'),
  ('id-jk', 'courier', 'mitra_agreement', 'consent', 'mitra_agreement', 'mitra-id-jk-v1', 'id-ID', 'courier_operations', 'compliance-id-jk-v1'),
  ('id-jk', 'merchant', 'legal_entity', 'identity', NULL, NULL, 'id-ID', 'merchant_onboarding', 'compliance-id-jk-v1'),
  ('id-jk', 'merchant', 'business_registration', 'document', 'nib', NULL, 'id-ID', 'merchant_onboarding', 'compliance-id-jk-v1'),
  ('id-jk', 'merchant', 'merchant_terms', 'consent', 'merchant_terms', 'merchant-terms-id-jk-v1', 'id-ID', 'merchant_operations', 'compliance-id-jk-v1')
ON CONFLICT (market_code, role_code, requirement_code, policy_version) DO NOTHING;

INSERT INTO market_compliance_data_policies (
  market_code, data_class, retention_days, export_mode, deletion_mode,
  policy_version, legal_basis
)
VALUES
  ('id-jk', 'identity', 1825, 'limited', 'anonymize', 'compliance-id-jk-v1', 'account_and_regulatory_obligation'),
  ('id-jk', 'verification_artifact', 1825, 'prohibited', 'retain_legal_hold', 'compliance-id-jk-v1', 'fraud_and_regulatory_obligation'),
  ('id-jk', 'consent', 3650, 'allowed', 'retain_legal_hold', 'compliance-id-jk-v1', 'consent_audit'),
  ('id-jk', 'operational', 730, 'allowed', 'delete', 'compliance-id-jk-v1', 'service_operations')
ON CONFLICT (market_code, data_class, policy_version) DO NOTHING;

INSERT INTO market_compliance_artifact_policies (
  market_code, role_code, artifact_type, storage_access_class,
  retention_days, export_mode, deletion_mode, policy_version
)
VALUES
  ('id-jk', 'courier', 'identity_document', 'compliance_only', 1825, 'prohibited', 'retain_legal_hold', 'compliance-id-jk-v1'),
  ('id-jk', 'courier', 'vehicle_document', 'compliance_only', 1825, 'prohibited', 'retain_legal_hold', 'compliance-id-jk-v1'),
  ('id-jk', 'merchant', 'business_document', 'compliance_only', 1825, 'prohibited', 'retain_legal_hold', 'compliance-id-jk-v1')
ON CONFLICT (market_code, role_code, artifact_type, policy_version) DO NOTHING;

-- Extend the existing launch readiness gate so a new market cannot become
-- transactional without an explicit policy for every supported role and a
-- retention policy. Service restriction remains data-driven through the
-- existing market_service_availability table.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION market_config_readiness(p_market_code TEXT, p_city_code TEXT DEFAULT NULL)
RETURNS TABLE (market_code TEXT, is_ready BOOLEAN, reason_codes TEXT[])
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cfg market_configs%ROWTYPE;
  requested_market TEXT := lower(trim(COALESCE(p_market_code, '')));
  requested_city TEXT := NULLIF(lower(trim(COALESCE(p_city_code, ''))), '');
  reasons TEXT[] := '{}'::TEXT[];
BEGIN
  SELECT * INTO cfg FROM market_configs WHERE market_configs.market_code = requested_market;
  IF NOT FOUND THEN
    RETURN QUERY SELECT requested_market, FALSE, ARRAY['market_not_configured']::TEXT[];
    RETURN;
  END IF;

  IF cfg.launch_state <> 'active' THEN reasons := array_append(reasons, 'market_not_active'); END IF;
  IF cfg.approval_status <> 'approved' THEN reasons := array_append(reasons, 'market_not_approved'); END IF;
  IF cfg.effective_from > NOW() THEN reasons := array_append(reasons, 'market_not_effective'); END IF;
  IF jsonb_array_length(cfg.payment_methods) = 0 THEN reasons := array_append(reasons, 'payment_methods_missing'); END IF;
  IF jsonb_array_length(cfg.logistics_providers) = 0 THEN reasons := array_append(reasons, 'logistics_providers_missing'); END IF;
  IF jsonb_array_length(cfg.map_providers) = 0 THEN reasons := array_append(reasons, 'map_providers_missing'); END IF;
  IF jsonb_array_length(cfg.tax_policy_refs) = 0 THEN reasons := array_append(reasons, 'tax_policy_missing'); END IF;
  IF jsonb_array_length(cfg.insurance_policy_refs) = 0 THEN reasons := array_append(reasons, 'insurance_policy_missing'); END IF;
  IF cfg.service_hours = '{}'::jsonb THEN reasons := array_append(reasons, 'service_hours_missing'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM market_service_availability msa
    WHERE msa.market_code = cfg.market_code
      AND msa.is_enabled
      AND (requested_city IS NULL OR msa.city_code = requested_city)
      AND msa.effective_from <= NOW()
  ) THEN reasons := array_append(reasons, 'service_availability_missing'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM market_legal_documents mld
    WHERE mld.market_code = cfg.market_code
      AND mld.document_type IN ('terms', 'privacy')
      AND mld.locale = cfg.default_locale
      AND mld.status = 'approved'
      AND mld.effective_from <= NOW()
    GROUP BY mld.market_code
    HAVING COUNT(DISTINCT mld.document_type) = 2
  ) THEN reasons := array_append(reasons, 'legal_documents_missing'); END IF;
  IF (
    SELECT COUNT(DISTINCT role_code)
    FROM market_compliance_requirements r
    WHERE r.market_code = cfg.market_code
      AND r.is_active AND r.is_required
      AND r.effective_from <= NOW()
      AND (r.effective_to IS NULL OR NOW() < r.effective_to)
  ) < 3 THEN reasons := array_append(reasons, 'compliance_requirements_missing'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM market_compliance_data_policies p
    WHERE p.market_code = cfg.market_code
      AND p.is_active AND p.effective_from <= NOW()
      AND (p.effective_to IS NULL OR NOW() < p.effective_to)
  ) THEN reasons := array_append(reasons, 'compliance_data_policy_missing'); END IF;

  RETURN QUERY SELECT cfg.market_code::TEXT, cardinality(reasons) = 0, reasons;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP TRIGGER IF EXISTS trg_market_compliance_consent_immutable ON market_compliance_consent_events;
DROP FUNCTION IF EXISTS prevent_market_compliance_consent_mutation();
DROP INDEX IF EXISTS uq_market_compliance_active_consent;
DROP TABLE IF EXISTS market_compliance_consent_events;
DROP TABLE IF EXISTS market_compliance_artifact_policies;
DROP TABLE IF EXISTS market_compliance_data_policies;
DROP TABLE IF EXISTS market_compliance_requirements;

-- Restore the readiness function owned by the preceding market configuration
-- migration. Keeping the Down path valid prevents a rollback from leaving a
-- function that references the compliance tables just removed above.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION market_config_readiness(p_market_code TEXT, p_city_code TEXT DEFAULT NULL)
RETURNS TABLE (market_code TEXT, is_ready BOOLEAN, reason_codes TEXT[])
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cfg market_configs%ROWTYPE;
  requested_market TEXT := lower(trim(COALESCE(p_market_code, '')));
  requested_city TEXT := NULLIF(lower(trim(COALESCE(p_city_code, ''))), '');
  reasons TEXT[] := '{}'::TEXT[];
BEGIN
  SELECT * INTO cfg FROM market_configs WHERE market_configs.market_code = requested_market;
  IF NOT FOUND THEN
    RETURN QUERY SELECT requested_market, FALSE, ARRAY['market_not_configured']::TEXT[];
    RETURN;
  END IF;

  IF cfg.launch_state <> 'active' THEN reasons := array_append(reasons, 'market_not_active'); END IF;
  IF cfg.approval_status <> 'approved' THEN reasons := array_append(reasons, 'market_not_approved'); END IF;
  IF cfg.effective_from > NOW() THEN reasons := array_append(reasons, 'market_not_effective'); END IF;
  IF jsonb_array_length(cfg.payment_methods) = 0 THEN reasons := array_append(reasons, 'payment_methods_missing'); END IF;
  IF jsonb_array_length(cfg.logistics_providers) = 0 THEN reasons := array_append(reasons, 'logistics_providers_missing'); END IF;
  IF jsonb_array_length(cfg.map_providers) = 0 THEN reasons := array_append(reasons, 'map_providers_missing'); END IF;
  IF jsonb_array_length(cfg.tax_policy_refs) = 0 THEN reasons := array_append(reasons, 'tax_policy_missing'); END IF;
  IF jsonb_array_length(cfg.insurance_policy_refs) = 0 THEN reasons := array_append(reasons, 'insurance_policy_missing'); END IF;
  IF cfg.service_hours = '{}'::jsonb THEN reasons := array_append(reasons, 'service_hours_missing'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM market_service_availability msa
    WHERE msa.market_code = cfg.market_code
      AND msa.is_enabled
      AND (requested_city IS NULL OR msa.city_code = requested_city)
      AND msa.effective_from <= NOW()
  ) THEN
    reasons := array_append(reasons, 'service_availability_missing');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM market_legal_documents mld
    WHERE mld.market_code = cfg.market_code
      AND mld.document_type IN ('terms', 'privacy')
      AND mld.locale = cfg.default_locale
      AND mld.status = 'approved'
      AND mld.effective_from <= NOW()
    GROUP BY mld.market_code
    HAVING COUNT(DISTINCT mld.document_type) = 2
  ) THEN
    reasons := array_append(reasons, 'legal_documents_missing');
  END IF;

  RETURN QUERY SELECT cfg.market_code::TEXT, cardinality(reasons) = 0, reasons;
END;
$$;
-- +goose StatementEnd
