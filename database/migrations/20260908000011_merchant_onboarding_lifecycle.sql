-- +goose Up
-- MERCH-2026-001: make merchant KYB/onboarding server-authoritative,
-- market-aware, and auditable while retaining verification_status for legacy
-- Food consumers.

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(32) NOT NULL DEFAULT 'ID-JK',
  ADD COLUMN IF NOT EXISTS onboarding_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_verified_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS onboarding_suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_suspension_reason TEXT;

ALTER TABLE merchants
  DROP CONSTRAINT IF EXISTS merchants_onboarding_status_check,
  ADD CONSTRAINT merchants_onboarding_status_check
    CHECK (onboarding_status IN ('DRAFT', 'SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED', 'SUSPENDED'));

UPDATE merchants
SET onboarding_status = CASE verification_status
  WHEN 'approved' THEN 'ACTIVE'
  WHEN 'rejected' THEN 'REJECTED'
  ELSE 'SUBMITTED'
END,
market_code = UPPER(COALESCE(NULLIF(BTRIM(market_code), ''), 'ID-JK')),
onboarding_submitted_at = COALESCE(onboarding_submitted_at, created_at),
onboarding_verified_at = CASE WHEN verification_status = 'approved' THEN COALESCE(onboarding_verified_at, updated_at) ELSE onboarding_verified_at END;

CREATE INDEX IF NOT EXISTS idx_merchants_onboarding_market
  ON merchants (market_code, onboarding_status, created_at DESC);

-- Legal, ownership, operator, market and payout/contract references are kept
-- as typed columns rather than an opaque onboarding JSON blob. Bank details
-- remain owned by the existing merchant bank-account fields and commercial
-- terms by merchant_commission_contracts.
CREATE TABLE IF NOT EXISTS merchant_legal_profiles (
  merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  legal_entity_type VARCHAR(24) NOT NULL CHECK (legal_entity_type IN ('perorangan', 'perusahaan')),
  legal_name VARCHAR(255) NOT NULL,
  registration_reference VARCHAR(255),
  tax_identifier VARCHAR(160),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  operator_user_id UUID NOT NULL REFERENCES users(id),
  market_code VARCHAR(32) NOT NULL,
  payout_account_reference VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_legal_profiles_market_code_check CHECK (market_code = UPPER(BTRIM(market_code)))
);

INSERT INTO merchant_legal_profiles (
  merchant_id, legal_entity_type, legal_name, registration_reference,
  tax_identifier, owner_user_id, operator_user_id, market_code,
  payout_account_reference
)
SELECT
  m.id,
  COALESCE(NULLIF(m.business_type, ''), 'perorangan'),
  m.nama_toko,
  CASE WHEN EXISTS (
    SELECT 1 FROM merchant_documents md
    WHERE md.merchant_id = m.id AND md.doc_type = 'nib'
  ) THEN 'merchant_document:nib' ELSE NULL END,
  m.npwp,
  m.user_id,
  m.user_id,
  m.market_code,
  'merchant_bank_account:' || m.id::text
FROM merchants m
ON CONFLICT (merchant_id) DO UPDATE
SET legal_entity_type = EXCLUDED.legal_entity_type,
    legal_name = EXCLUDED.legal_name,
    registration_reference = EXCLUDED.registration_reference,
    tax_identifier = EXCLUDED.tax_identifier,
    owner_user_id = EXCLUDED.owner_user_id,
    operator_user_id = EXCLUDED.operator_user_id,
    market_code = EXCLUDED.market_code,
    payout_account_reference = EXCLUDED.payout_account_reference,
    updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_merchant_legal_profiles_market
  ON merchant_legal_profiles (market_code, legal_entity_type);

-- Requirements are configuration data. A missing active policy fails closed at
-- activation; one policy can require a different document set per market and
-- legal entity type without a code fork.
CREATE TABLE IF NOT EXISTS merchant_market_verification_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL,
  legal_entity_type VARCHAR(24) NOT NULL CHECK (legal_entity_type IN ('all', 'perorangan', 'perusahaan')),
  document_type VARCHAR(30) NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  policy_version VARCHAR(80) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_market_verification_requirements_document_check
    CHECK (document_type IN ('ktp_pemilik', 'foto_tempat_usaha', 'rekening_bank', 'nib')),
  CONSTRAINT merchant_market_verification_requirements_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT merchant_market_verification_requirements_scope_version_unique
    UNIQUE (market_code, legal_entity_type, document_type, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_merchant_market_verification_requirements_lookup
  ON merchant_market_verification_requirements (market_code, legal_entity_type, effective_from DESC)
  WHERE is_active;

INSERT INTO merchant_market_verification_requirements
  (market_code, legal_entity_type, document_type, is_required, policy_version)
VALUES
  ('ID-JK', 'all', 'ktp_pemilik', TRUE, 'merchant-id-jk-v1'),
  ('ID-JK', 'all', 'foto_tempat_usaha', TRUE, 'merchant-id-jk-v1'),
  ('ID-JK', 'all', 'rekening_bank', TRUE, 'merchant-id-jk-v1'),
  ('ID-JK', 'perusahaan', 'nib', TRUE, 'merchant-id-jk-v1')
ON CONFLICT (market_code, legal_entity_type, document_type, policy_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS merchant_onboarding_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  actor_id UUID REFERENCES users(id),
  reason TEXT,
  requirement_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_onboarding_reviews_status_check
    CHECK (from_status IN ('DRAFT', 'SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED', 'SUSPENDED')
       AND to_status IN ('DRAFT', 'SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED', 'SUSPENDED'))
);

CREATE INDEX IF NOT EXISTS idx_merchant_onboarding_reviews_merchant_created
  ON merchant_onboarding_reviews (merchant_id, created_at DESC);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_onboarding_requirements_met(merchant_id_value UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  resolved_market TEXT;
  resolved_entity TEXT;
  required_count INTEGER;
BEGIN
  SELECT m.market_code, lp.legal_entity_type
    INTO resolved_market, resolved_entity
    FROM merchants m
    JOIN merchant_legal_profiles lp ON lp.merchant_id = m.id
   WHERE m.id = merchant_id_value;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*) INTO required_count
    FROM merchant_market_verification_requirements requirement
   WHERE requirement.market_code = resolved_market
     AND requirement.legal_entity_type IN ('all', resolved_entity)
     AND requirement.is_required
     AND requirement.is_active
     AND requirement.effective_from <= NOW()
     AND (requirement.effective_to IS NULL OR NOW() < requirement.effective_to);
  IF required_count = 0 THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
      FROM merchant_market_verification_requirements requirement
     WHERE requirement.market_code = resolved_market
       AND requirement.legal_entity_type IN ('all', resolved_entity)
       AND requirement.is_required
       AND requirement.is_active
       AND requirement.effective_from <= NOW()
       AND (requirement.effective_to IS NULL OR NOW() < requirement.effective_to)
       AND NOT EXISTS (
         SELECT 1 FROM merchant_documents document
          WHERE document.merchant_id = merchant_id_value
            AND document.doc_type = requirement.document_type
       )
  );
END;
$$;
-- +goose StatementEnd

-- Keep the legacy verification field a compatible projection of the canonical
-- lifecycle. State changes outside transition_merchant_onboarding are denied.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION guard_merchant_onboarding_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.market_code := UPPER(NULLIF(BTRIM(COALESCE(NEW.market_code, '')), ''));
  IF NEW.market_code IS NULL THEN
    RAISE EXCEPTION 'merchant market_code is required';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.onboarding_status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION 'merchant onboarding application must start in DRAFT or SUBMITTED';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     AND COALESCE(current_setting('app.merchant_onboarding_transition', TRUE), '') <> 'true' THEN
    RAISE EXCEPTION 'merchant onboarding_status must transition via transition_merchant_onboarding';
  END IF;

  NEW.verification_status := CASE NEW.onboarding_status
    WHEN 'ACTIVE' THEN 'approved'
    WHEN 'REJECTED' THEN 'rejected'
    ELSE 'pending'
  END;
  IF NEW.onboarding_status <> 'ACTIVE' THEN
    NEW.is_open := FALSE;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_guard_merchant_onboarding_state ON merchants;
CREATE TRIGGER trg_guard_merchant_onboarding_state
BEFORE INSERT OR UPDATE OF onboarding_status, market_code, verification_status, is_open ON merchants
FOR EACH ROW EXECUTE FUNCTION guard_merchant_onboarding_state();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION transition_merchant_onboarding(
  merchant_id_value UUID,
  next_status_value TEXT,
  actor_id_value UUID DEFAULT NULL,
  reason_value TEXT DEFAULT NULL,
  metadata_value JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  merchant_id UUID,
  onboarding_status TEXT,
  verification_status TEXT,
  requirements_met BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  current_merchant merchants%ROWTYPE;
  next_status TEXT := UPPER(BTRIM(COALESCE(next_status_value, '')));
  requirements_snapshot JSONB;
  is_allowed BOOLEAN := FALSE;
  met BOOLEAN := FALSE;
BEGIN
  SELECT * INTO current_merchant FROM merchants WHERE id = merchant_id_value FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant not found';
  END IF;
  IF next_status NOT IN ('DRAFT', 'SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED', 'SUSPENDED') THEN
    RAISE EXCEPTION 'invalid merchant onboarding status %', next_status;
  END IF;

  is_allowed := (current_merchant.onboarding_status = 'DRAFT' AND next_status = 'SUBMITTED')
    OR (current_merchant.onboarding_status = 'SUBMITTED' AND next_status IN ('VERIFYING', 'REJECTED'))
    OR (current_merchant.onboarding_status = 'VERIFYING' AND next_status IN ('ACTIVE', 'REJECTED'))
    OR (current_merchant.onboarding_status = 'ACTIVE' AND next_status = 'SUSPENDED')
    OR (current_merchant.onboarding_status = 'SUSPENDED' AND next_status = 'VERIFYING')
    OR (current_merchant.onboarding_status = 'REJECTED' AND next_status IN ('DRAFT', 'SUBMITTED'));
  IF NOT is_allowed THEN
    RAISE EXCEPTION 'invalid merchant onboarding transition % -> %', current_merchant.onboarding_status, next_status;
  END IF;

  met := merchant_onboarding_requirements_met(merchant_id_value);
  IF next_status = 'ACTIVE' AND NOT met THEN
    RAISE EXCEPTION 'merchant activation requires current market verification requirements';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'document_type', requirement.document_type,
      'legal_entity_type', requirement.legal_entity_type,
      'policy_version', requirement.policy_version,
      'is_required', requirement.is_required
    ) ORDER BY requirement.document_type), '[]'::jsonb)
    INTO requirements_snapshot
    FROM merchant_market_verification_requirements requirement
   WHERE requirement.market_code = current_merchant.market_code
     AND requirement.legal_entity_type IN ('all', (
       SELECT profile.legal_entity_type FROM merchant_legal_profiles profile WHERE profile.merchant_id = merchant_id_value
     ))
     AND requirement.is_active
     AND requirement.effective_from <= NOW()
     AND (requirement.effective_to IS NULL OR NOW() < requirement.effective_to);

  PERFORM set_config('app.merchant_onboarding_transition', 'true', TRUE);
  UPDATE merchants
     SET onboarding_status = next_status,
         onboarding_submitted_at = CASE WHEN next_status = 'SUBMITTED' THEN NOW() ELSE onboarding_submitted_at END,
         onboarding_verified_at = CASE WHEN next_status = 'ACTIVE' THEN NOW() ELSE onboarding_verified_at END,
         onboarding_verified_by = CASE WHEN next_status = 'ACTIVE' THEN actor_id_value ELSE onboarding_verified_by END,
         onboarding_suspended_at = CASE WHEN next_status = 'SUSPENDED' THEN NOW() ELSE NULL END,
         onboarding_suspension_reason = CASE WHEN next_status = 'SUSPENDED' THEN NULLIF(BTRIM(reason_value), '') ELSE NULL END,
         rejection_reason = CASE WHEN next_status = 'REJECTED' THEN NULLIF(BTRIM(reason_value), '') WHEN next_status = 'ACTIVE' THEN NULL ELSE rejection_reason END,
         updated_at = NOW()
   WHERE id = merchant_id_value;

  INSERT INTO merchant_onboarding_reviews (
    merchant_id, from_status, to_status, actor_id, reason, requirement_snapshot, metadata
  ) VALUES (
    merchant_id_value, current_merchant.onboarding_status, next_status,
    actor_id_value, NULLIF(BTRIM(reason_value), ''), requirements_snapshot,
    COALESCE(metadata_value, '{}'::jsonb)
  );

  RETURN QUERY
  SELECT m.id, m.onboarding_status::TEXT, m.verification_status::TEXT, met
    FROM merchants m WHERE m.id = merchant_id_value;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP TRIGGER IF EXISTS trg_guard_merchant_onboarding_state ON merchants;
DROP FUNCTION IF EXISTS transition_merchant_onboarding(UUID, TEXT, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS guard_merchant_onboarding_state();
DROP FUNCTION IF EXISTS merchant_onboarding_requirements_met(UUID);
DROP INDEX IF EXISTS idx_merchant_onboarding_reviews_merchant_created;
DROP TABLE IF EXISTS merchant_onboarding_reviews;
DROP INDEX IF EXISTS idx_merchant_market_verification_requirements_lookup;
DROP TABLE IF EXISTS merchant_market_verification_requirements;
DROP INDEX IF EXISTS idx_merchant_legal_profiles_market;
DROP TABLE IF EXISTS merchant_legal_profiles;
DROP INDEX IF EXISTS idx_merchants_onboarding_market;
ALTER TABLE merchants
  DROP CONSTRAINT IF EXISTS merchants_onboarding_status_check,
  DROP COLUMN IF EXISTS onboarding_suspension_reason,
  DROP COLUMN IF EXISTS onboarding_suspended_at,
  DROP COLUMN IF EXISTS onboarding_verified_by,
  DROP COLUMN IF EXISTS onboarding_verified_at,
  DROP COLUMN IF EXISTS onboarding_submitted_at,
  DROP COLUMN IF EXISTS market_code,
  DROP COLUMN IF EXISTS onboarding_status;
