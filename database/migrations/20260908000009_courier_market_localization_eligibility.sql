-- +goose Up
-- COURIER-2026-011: market policy, localized courier money, and explicit
-- working/cross-border eligibility. This remains in the existing courier
-- bounded context; courier_profiles.market_code remains the assignment truth.

CREATE TABLE IF NOT EXISTS courier_market_configs (
  market_code VARCHAR(40) PRIMARY KEY,
  country_code VARCHAR(2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  currency_minor_unit SMALLINT NOT NULL DEFAULT 0,
  timezone VARCHAR(64) NOT NULL,
  display_locale VARCHAR(32) NOT NULL,
  required_vehicle_types TEXT[] NOT NULL DEFAULT '{}'::text[],
  required_document_types TEXT[] NOT NULL DEFAULT '{}'::text[],
  required_tax_profile JSONB NOT NULL DEFAULT '{"required": false}'::jsonb,
  required_payout_methods TEXT[] NOT NULL DEFAULT '{}'::text[],
  cross_border_supported BOOLEAN NOT NULL DEFAULT FALSE,
  policy_version VARCHAR(80) NOT NULL DEFAULT 'courier-market-v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courier_market_configs_country_code_ck CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT courier_market_configs_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT courier_market_configs_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3),
  CONSTRAINT courier_market_configs_requirements_ck CHECK (jsonb_typeof(required_tax_profile) = 'object')
);

INSERT INTO courier_market_configs (
  market_code, country_code, currency_code, currency_minor_unit, timezone,
  display_locale, required_vehicle_types, required_document_types,
  required_tax_profile, required_payout_methods, policy_version, metadata
)
VALUES (
  'id', 'ID', 'IDR', 0, 'Asia/Jakarta', 'id-ID',
  ARRAY['motor', 'car', 'towing_truck']::text[], ARRAY[]::text[],
  '{"required": false, "rule_code": null, "require_npwp": false}'::jsonb,
  ARRAY[]::text[], 'courier-market-id-v1',
  '{"display_name": "Indonesia", "legacy_zone_market_codes": ["ID-JK"]}'::jsonb
)
ON CONFLICT (market_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS courier_market_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  market_code VARCHAR(40) NOT NULL REFERENCES courier_market_configs(market_code),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  vehicle_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  documents_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  tax_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  payout_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  checked_policy_version VARCHAR(80),
  rejection_reason TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  evidence_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courier_market_verifications_status_ck CHECK (status IN ('pending', 'approved', 'rejected', 'reverification_required')),
  UNIQUE (courier_profile_id, market_code)
);

CREATE INDEX IF NOT EXISTS idx_courier_market_verifications_status
  ON courier_market_verifications (market_code, status, expires_at);

CREATE TABLE IF NOT EXISTS courier_market_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  from_market_code VARCHAR(40) NOT NULL,
  target_market_code VARCHAR(40) NOT NULL REFERENCES courier_market_configs(market_code),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  reason TEXT,
  idempotency_key TEXT,
  requested_by UUID,
  reviewed_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT courier_market_change_requests_status_ck CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT courier_market_change_requests_different_market_ck CHECK (from_market_code <> target_market_code),
  UNIQUE (courier_profile_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_courier_market_change_requests_queue
  ON courier_market_change_requests (status, requested_at DESC);

CREATE TABLE IF NOT EXISTS courier_cross_border_working_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  origin_market_code VARCHAR(40) NOT NULL REFERENCES courier_market_configs(market_code),
  target_market_code VARCHAR(40) NOT NULL REFERENCES courier_market_configs(market_code),
  status VARCHAR(32) NOT NULL DEFAULT 'not_supported',
  regulatory_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  vehicle_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  documents_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  tax_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  payout_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  decision_reason TEXT,
  policy_version VARCHAR(80),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courier_cross_border_status_ck CHECK (status IN ('not_supported', 'not_requested', 'pending', 'approved', 'rejected', 'expired')),
  CONSTRAINT courier_cross_border_different_market_ck CHECK (origin_market_code <> target_market_code),
  UNIQUE (courier_profile_id, origin_market_code, target_market_code)
);

ALTER TABLE courier_profiles
  ADD COLUMN IF NOT EXISTS market_change_request_id UUID;

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courier_profiles_market_change_request_fk'
  ) THEN
    ALTER TABLE courier_profiles
      ADD CONSTRAINT courier_profiles_market_change_request_fk
      FOREIGN KEY (market_change_request_id) REFERENCES courier_market_change_requests(id);
  END IF;
END;
$$;
-- +goose StatementEnd

ALTER TABLE courier_earnings_ledger
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64),
  ADD COLUMN IF NOT EXISTS display_locale VARCHAR(32);
ALTER TABLE courier_earnings_ledger
  ALTER COLUMN amount_idr DROP NOT NULL;

ALTER TABLE courier_payout_accounts
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3);

ALTER TABLE courier_payout_requests
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS fee_minor BIGINT,
  ADD COLUMN IF NOT EXISTS net_amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3);
ALTER TABLE courier_payout_requests
  ALTER COLUMN amount_idr DROP NOT NULL,
  ALTER COLUMN fee_idr DROP NOT NULL;

CREATE TABLE IF NOT EXISTS courier_earning_localization_snapshots (
  ledger_id UUID PRIMARY KEY REFERENCES courier_earnings_ledger(id) ON DELETE CASCADE,
  market_code VARCHAR(40) NOT NULL REFERENCES courier_market_configs(market_code),
  currency_code VARCHAR(3) NOT NULL,
  currency_minor_unit SMALLINT NOT NULL DEFAULT 0,
  timezone VARCHAR(64) NOT NULL,
  display_locale VARCHAR(32) NOT NULL,
  amount_minor BIGINT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The financial ledger is append-only, so historical localization is captured
-- in a metadata snapshot instead of mutating settled earning facts.
INSERT INTO courier_earning_localization_snapshots (
  ledger_id, market_code, currency_code, currency_minor_unit, timezone,
  display_locale, amount_minor
)
SELECT cel.id,
  COALESCE(NULLIF(cel.market_code, ''), NULLIF(cp.market_code, ''), 'id'),
  COALESCE(NULLIF(cel.currency_code, ''), cmc.currency_code, 'IDR'),
  COALESCE(cmc.currency_minor_unit, 0),
  COALESCE(NULLIF(cel.timezone, ''), cmc.timezone, 'Asia/Jakarta'),
  COALESCE(NULLIF(cel.display_locale, ''), cmc.display_locale, 'id-ID'),
  COALESCE(cel.amount_minor, cel.amount_idr, 0)
FROM courier_earnings_ledger cel
LEFT JOIN courier_profiles cp ON cp.user_id = cel.courier_id
LEFT JOIN courier_market_configs cmc ON cmc.market_code = COALESCE(NULLIF(cel.market_code, ''), NULLIF(cp.market_code, ''), 'id')
ON CONFLICT (ledger_id) DO NOTHING;

-- courier_earnings_ledger is append-only. Existing facts are intentionally not
-- updated; the read API resolves NULL legacy localization from the courier's
-- current policy while all new facts receive an immutable snapshot below.

UPDATE courier_payout_accounts cpa
SET market_code = COALESCE(NULLIF(cp.market_code, ''), 'id'),
    currency_code = COALESCE(cmc.currency_code, 'IDR')
FROM courier_profiles cp
LEFT JOIN courier_market_configs cmc ON cmc.market_code = COALESCE(NULLIF(cp.market_code, ''), 'id')
WHERE cpa.courier_profile_id = cp.id OR cpa.courier_id = cp.user_id;

UPDATE courier_payout_accounts
SET market_code = COALESCE(market_code, 'id'), currency_code = COALESCE(currency_code, 'IDR')
WHERE market_code IS NULL OR currency_code IS NULL;

UPDATE courier_payout_requests pr
SET amount_minor = COALESCE(pr.amount_minor, pr.amount_idr),
    fee_minor = COALESCE(pr.fee_minor, pr.fee_idr),
    net_amount_minor = COALESCE(pr.net_amount_minor, pr.net_amount_idr),
    market_code = COALESCE(NULLIF(cp.market_code, ''), 'id'),
    currency_code = COALESCE(cmc.currency_code, 'IDR')
FROM courier_profiles cp
LEFT JOIN courier_market_configs cmc ON cmc.market_code = COALESCE(NULLIF(cp.market_code, ''), 'id')
WHERE pr.courier_id = cp.user_id;

UPDATE courier_payout_requests
SET amount_minor = COALESCE(amount_minor, amount_idr),
    fee_minor = COALESCE(fee_minor, fee_idr),
    net_amount_minor = COALESCE(net_amount_minor, net_amount_idr),
    market_code = COALESCE(market_code, 'id'),
    currency_code = COALESCE(currency_code, 'IDR')
WHERE amount_minor IS NULL OR fee_minor IS NULL OR net_amount_minor IS NULL
   OR market_code IS NULL OR currency_code IS NULL;

-- The trigger supplies localization for legacy writers. It deliberately refuses
-- to reinterpret an IDR-only writer as a non-IDR transaction.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION localize_courier_ledger_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  profile_market TEXT;
  config_row courier_market_configs%ROWTYPE;
BEGIN
  SELECT COALESCE(NULLIF(cp.market_code, ''), 'id')
  INTO profile_market
  FROM courier_profiles cp
  WHERE cp.id = NEW.courier_id OR cp.user_id = NEW.courier_id
  LIMIT 1;

  NEW.market_code := COALESCE(NULLIF(NEW.market_code, ''), profile_market, 'id');
  SELECT * INTO config_row FROM courier_market_configs WHERE market_code = NEW.market_code;
  IF NOT FOUND OR NOT config_row.is_active THEN
    RAISE EXCEPTION 'courier market % is not configured or active', NEW.market_code;
  END IF;

  IF NEW.amount_minor IS NULL AND NEW.amount_idr IS NOT NULL THEN
    IF config_row.currency_code <> 'IDR' THEN
      RAISE EXCEPTION 'non-IDR courier ledger rows require amount_minor and an explicit currency';
    END IF;
    NEW.amount_minor := NEW.amount_idr;
  END IF;
  NEW.currency_code := COALESCE(NULLIF(NEW.currency_code, ''), config_row.currency_code);
  IF NEW.currency_code <> 'IDR' AND NEW.amount_minor IS NULL THEN
    RAISE EXCEPTION 'non-IDR courier ledger rows require amount_minor';
  END IF;
  IF NEW.amount_minor IS NULL THEN
    RAISE EXCEPTION 'courier ledger rows require amount_minor';
  END IF;
  NEW.timezone := COALESCE(NULLIF(NEW.timezone, ''), config_row.timezone);
  NEW.display_locale := COALESCE(NULLIF(NEW.display_locale, ''), config_row.display_locale);
  IF NEW.currency_code <> config_row.currency_code THEN
    RAISE EXCEPTION 'courier ledger currency does not match market policy';
  END IF;
  IF NEW.currency_code = 'IDR' AND NEW.amount_idr IS NULL THEN
    NEW.amount_idr := NEW.amount_minor::INTEGER;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_localize_courier_ledger_row ON courier_earnings_ledger;
CREATE TRIGGER trg_localize_courier_ledger_row
BEFORE INSERT ON courier_earnings_ledger
FOR EACH ROW EXECUTE FUNCTION localize_courier_ledger_row();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION snapshot_courier_ledger_localization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  config_row courier_market_configs%ROWTYPE;
BEGIN
  SELECT * INTO config_row FROM courier_market_configs WHERE market_code = NEW.market_code;
  INSERT INTO courier_earning_localization_snapshots (
    ledger_id, market_code, currency_code, currency_minor_unit, timezone,
    display_locale, amount_minor
  ) VALUES (
    NEW.id, NEW.market_code, NEW.currency_code, config_row.currency_minor_unit,
    NEW.timezone, NEW.display_locale, COALESCE(NEW.amount_minor, NEW.amount_idr, 0)
  ) ON CONFLICT (ledger_id) DO NOTHING;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_snapshot_courier_ledger_localization ON courier_earnings_ledger;
CREATE TRIGGER trg_snapshot_courier_ledger_localization
AFTER INSERT ON courier_earnings_ledger
FOR EACH ROW EXECUTE FUNCTION snapshot_courier_ledger_localization();

-- Payout rows are mutable workflow records, but their market/currency snapshot
-- must still be written server-side by legacy payout writers.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION localize_courier_payout_account_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  profile_market TEXT;
  config_row courier_market_configs%ROWTYPE;
BEGIN
  SELECT COALESCE(NULLIF(cp.market_code, ''), 'id') INTO profile_market
  FROM courier_profiles cp WHERE cp.id = NEW.courier_profile_id OR cp.user_id = NEW.courier_id LIMIT 1;
  NEW.market_code := COALESCE(NULLIF(NEW.market_code, ''), profile_market, 'id');
  SELECT * INTO config_row FROM courier_market_configs WHERE market_code = NEW.market_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'courier payout market % is not configured', NEW.market_code; END IF;
  NEW.currency_code := COALESCE(NULLIF(NEW.currency_code, ''), config_row.currency_code);
  IF NEW.currency_code <> config_row.currency_code THEN RAISE EXCEPTION 'payout account currency does not match market policy'; END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_localize_courier_payout_account_row ON courier_payout_accounts;
CREATE TRIGGER trg_localize_courier_payout_account_row
BEFORE INSERT ON courier_payout_accounts
FOR EACH ROW EXECUTE FUNCTION localize_courier_payout_account_row();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION localize_courier_payout_request_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  profile_market TEXT;
  config_row courier_market_configs%ROWTYPE;
BEGIN
  SELECT COALESCE(NULLIF(cp.market_code, ''), 'id') INTO profile_market
  FROM courier_profiles cp WHERE cp.user_id = NEW.courier_id LIMIT 1;
  NEW.market_code := COALESCE(NULLIF(NEW.market_code, ''), profile_market, 'id');
  SELECT * INTO config_row FROM courier_market_configs WHERE market_code = NEW.market_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'courier payout market % is not configured', NEW.market_code; END IF;
  NEW.currency_code := COALESCE(NULLIF(NEW.currency_code, ''), config_row.currency_code);
  IF NEW.amount_minor IS NULL AND NEW.amount_idr IS NOT NULL THEN
    IF config_row.currency_code <> 'IDR' THEN RAISE EXCEPTION 'non-IDR payout requests require amount_minor'; END IF;
    NEW.amount_minor := NEW.amount_idr;
  END IF;
  IF NEW.amount_minor IS NULL THEN
    RAISE EXCEPTION 'courier payout requests require amount_minor';
  END IF;
  NEW.fee_minor := COALESCE(NEW.fee_minor, NEW.fee_idr, 0);
  NEW.net_amount_minor := COALESCE(NEW.net_amount_minor, NEW.net_amount_idr, NEW.amount_minor - NEW.fee_minor);
  IF config_row.currency_code = 'IDR' THEN
    NEW.amount_idr := COALESCE(NEW.amount_idr, NEW.amount_minor::INTEGER);
    NEW.fee_idr := COALESCE(NEW.fee_idr, NEW.fee_minor::INTEGER, 0);
  END IF;
  IF NEW.currency_code <> config_row.currency_code THEN RAISE EXCEPTION 'payout request currency does not match market policy'; END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_localize_courier_payout_request_row ON courier_payout_requests;
CREATE TRIGGER trg_localize_courier_payout_request_row
BEFORE INSERT ON courier_payout_requests
FOR EACH ROW EXECUTE FUNCTION localize_courier_payout_request_row();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_market_eligibility(p_profile_id UUID, p_market_code TEXT)
RETURNS TABLE (
  market_code TEXT,
  country_code TEXT,
  currency_code TEXT,
  currency_minor_unit SMALLINT,
  timezone TEXT,
  display_locale TEXT,
  cross_border_supported BOOLEAN,
  policy_version TEXT,
  verification_status TEXT,
  is_eligible BOOLEAN,
  reason_codes TEXT[]
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cfg courier_market_configs%ROWTYPE;
  profile_row RECORD;
  verification_row RECORD;
  reasons TEXT[] := '{}'::TEXT[];
  vehicle_ok BOOLEAN := TRUE;
  documents_ok BOOLEAN := TRUE;
  tax_ok BOOLEAN := TRUE;
  payout_ok BOOLEAN := TRUE;
  tax_required BOOLEAN := FALSE;
  payout_required BOOLEAN := FALSE;
BEGIN
  SELECT * INTO cfg
  FROM courier_market_configs
  WHERE courier_market_configs.market_code = lower(trim(COALESCE(p_market_code, '')));
  IF NOT FOUND THEN
    RETURN QUERY SELECT lower(trim(COALESCE(p_market_code, ''))), NULL::TEXT, NULL::TEXT, NULL::SMALLINT,
      NULL::TEXT, NULL::TEXT, FALSE, NULL::TEXT, 'not_configured'::TEXT, FALSE,
      ARRAY['market_not_configured']::TEXT[];
    RETURN;
  END IF;

  SELECT cp.id, cp.user_id, cp.vehicle_type, cp.vehicle_category, cp.onboarding_status,
         cp.verification_status
  INTO profile_row
  FROM courier_profiles cp
  WHERE cp.id = p_profile_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT cfg.market_code::TEXT, cfg.country_code::TEXT, cfg.currency_code::TEXT,
      cfg.currency_minor_unit, cfg.timezone::TEXT, cfg.display_locale::TEXT,
      cfg.cross_border_supported, cfg.policy_version::TEXT, 'missing'::TEXT, FALSE,
      ARRAY['courier_profile_not_found']::TEXT[];
    RETURN;
  END IF;

  SELECT cmv.status, cmv.checked_policy_version, cmv.expires_at
  INTO verification_row
  FROM courier_market_verifications cmv
  WHERE cmv.courier_profile_id = p_profile_id AND cmv.market_code = cfg.market_code;
  IF NOT FOUND THEN
    reasons := array_append(reasons, 'market_verification_missing');
  ELSE
    IF verification_row.status <> 'approved' THEN
      reasons := array_append(reasons, 'market_verification_not_approved');
    END IF;
    IF verification_row.checked_policy_version IS DISTINCT FROM cfg.policy_version THEN
      reasons := array_append(reasons, 'market_policy_reverification_required');
    END IF;
    IF verification_row.expires_at IS NOT NULL AND verification_row.expires_at <= NOW() THEN
      reasons := array_append(reasons, 'market_verification_expired');
    END IF;
  END IF;

  IF NOT cfg.is_active THEN
    reasons := array_append(reasons, 'market_inactive');
  END IF;
  IF profile_row.onboarding_status IS DISTINCT FROM 'ACTIVE' OR profile_row.verification_status IS DISTINCT FROM 'approved' THEN
    reasons := array_append(reasons, 'courier_onboarding_not_active');
  END IF;

  IF cardinality(cfg.required_vehicle_types) > 0 THEN
    SELECT EXISTS (
      SELECT 1
      FROM courier_vehicles cv
      WHERE cv.courier_profile_id = p_profile_id
        AND cv.verification_status = 'approved'
        AND lower(cv.vehicle_type) = ANY (ARRAY(SELECT lower(value) FROM unnest(cfg.required_vehicle_types) value))
    ) INTO vehicle_ok;
    IF NOT vehicle_ok THEN reasons := array_append(reasons, 'vehicle_requirement_not_met'); END IF;
  END IF;

  IF cardinality(cfg.required_document_types) > 0 THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM unnest(cfg.required_document_types) required(doc_type)
      WHERE NOT EXISTS (
        SELECT 1 FROM courier_documents cd
        WHERE cd.courier_id = p_profile_id
          AND cd.doc_type = required.doc_type
          AND cd.document_status = 'verified'
          AND cd.deleted_at IS NULL
          AND cd.revoked_at IS NULL
          AND (cd.expires_at IS NULL OR cd.expires_at >= CURRENT_DATE)
      )
    ) INTO documents_ok;
    IF NOT documents_ok THEN reasons := array_append(reasons, 'document_requirement_not_met'); END IF;
  END IF;

  tax_required := lower(COALESCE(cfg.required_tax_profile->>'required', 'false')) IN ('true', '1', 'yes');
  IF tax_required THEN
    SELECT EXISTS (
      SELECT 1 FROM user_tax_profiles utp
      WHERE utp.user_id = profile_row.user_id
        AND (NULLIF(utp.npwp, '') IS NOT NULL OR NULLIF(utp.nik, '') IS NOT NULL)
    ) INTO tax_ok;
    IF COALESCE(cfg.required_tax_profile->>'require_npwp', 'false')::BOOLEAN AND NOT EXISTS (
      SELECT 1 FROM user_tax_profiles utp WHERE utp.user_id = profile_row.user_id AND NULLIF(utp.npwp, '') IS NOT NULL
    ) THEN
      tax_ok := FALSE;
    END IF;
    IF NOT tax_ok THEN reasons := array_append(reasons, 'tax_requirement_not_met'); END IF;
  END IF;

  payout_required := cardinality(cfg.required_payout_methods) > 0;
  IF payout_required THEN
    SELECT EXISTS (
      SELECT 1 FROM courier_payout_accounts cpa
      WHERE (cpa.courier_profile_id = p_profile_id OR cpa.courier_id = profile_row.user_id)
        AND cpa.status = 'verified'
        AND lower(cpa.bank_code) = ANY (ARRAY(SELECT lower(value) FROM unnest(cfg.required_payout_methods) value))
    ) INTO payout_ok;
    IF NOT payout_ok THEN reasons := array_append(reasons, 'payout_requirement_not_met'); END IF;
  END IF;

  RETURN QUERY SELECT cfg.market_code::TEXT, cfg.country_code::TEXT, cfg.currency_code::TEXT,
    cfg.currency_minor_unit, cfg.timezone::TEXT, cfg.display_locale::TEXT,
    cfg.cross_border_supported, cfg.policy_version::TEXT,
    COALESCE(verification_row.status, 'missing')::TEXT,
    cardinality(reasons) = 0 AND vehicle_ok AND documents_ok AND tax_ok AND payout_ok,
    reasons;
END;
$$;
-- +goose StatementEnd

-- Boolean wrapper keeps existing offer/dispatch SQL concise and makes market
-- eligibility impossible to bypass when capability eligibility is evaluated.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_market_is_eligible(p_profile_id UUID, p_market_code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT is_eligible FROM courier_market_eligibility($1, $2);
$$;
-- +goose StatementEnd

-- Preserve the existing capability contract while adding the market gate.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_capability_is_eligible(profile_id UUID, service_code_value TEXT, market_code_value TEXT DEFAULT NULL)
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
  IF NOT FOUND THEN RETURN FALSE; END IF;

  RETURN courier_market_is_eligible(profile_id, resolved_market)
    AND EXISTS (
      SELECT 1
      FROM courier_service_capabilities csc
      WHERE csc.courier_profile_id = profile_id
        AND csc.service_code = service_code_value
        AND csc.status = 'enabled'
        AND (csc.effective_from IS NULL OR csc.effective_from <= CURRENT_DATE)
        AND (csc.expires_at IS NULL OR csc.expires_at >= CURRENT_DATE)
        AND ('*' = ANY(csc.market_scope) OR resolved_market IS NULL OR resolved_market = ANY(csc.market_scope))
        AND courier_profile_documents_eligible(profile_id)
        AND NOT courier_enforcement_is_active(profile_id, resolved_market, service_code_value)
    );
END;
$$;
-- +goose StatementEnd

-- Existing active couriers receive a policy snapshot only when their current
-- operational state and approved vehicle satisfy the seeded Indonesian policy.
INSERT INTO courier_market_verifications (
  courier_profile_id, market_code, status, vehicle_eligible, documents_eligible,
  tax_eligible, payout_eligible, checked_policy_version, verified_at, evidence_metadata
)
SELECT cp.id, cfg.market_code,
  CASE WHEN cp.onboarding_status = 'ACTIVE'
             AND cp.verification_status = 'approved'
             AND (cardinality(cfg.required_vehicle_types) = 0 OR EXISTS (
               SELECT 1 FROM courier_vehicles cv
               WHERE cv.courier_profile_id = cp.id AND cv.verification_status = 'approved'
                 AND lower(cv.vehicle_type) = ANY (ARRAY(SELECT lower(value) FROM unnest(cfg.required_vehicle_types) value))
             ))
             AND (cardinality(cfg.required_document_types) = 0 OR NOT EXISTS (
               SELECT 1 FROM unnest(cfg.required_document_types) required(doc_type)
               WHERE NOT EXISTS (SELECT 1 FROM courier_documents cd WHERE cd.courier_id = cp.id AND cd.doc_type = required.doc_type AND cd.document_status = 'verified' AND cd.deleted_at IS NULL AND cd.revoked_at IS NULL AND (cd.expires_at IS NULL OR cd.expires_at >= CURRENT_DATE))
             ))
       THEN 'approved' ELSE 'pending' END,
  cardinality(cfg.required_vehicle_types) = 0 OR EXISTS (
    SELECT 1 FROM courier_vehicles cv WHERE cv.courier_profile_id = cp.id AND cv.verification_status = 'approved'
      AND lower(cv.vehicle_type) = ANY (ARRAY(SELECT lower(value) FROM unnest(cfg.required_vehicle_types) value))
  ),
  cardinality(cfg.required_document_types) = 0 OR NOT EXISTS (
    SELECT 1 FROM unnest(cfg.required_document_types) required(doc_type)
    WHERE NOT EXISTS (SELECT 1 FROM courier_documents cd WHERE cd.courier_id = cp.id AND cd.doc_type = required.doc_type AND cd.document_status = 'verified' AND cd.deleted_at IS NULL AND cd.revoked_at IS NULL AND (cd.expires_at IS NULL OR cd.expires_at >= CURRENT_DATE))
  ),
  FALSE, FALSE, cfg.policy_version,
  CASE WHEN cp.onboarding_status = 'ACTIVE' AND cp.verification_status = 'approved' THEN NOW() ELSE NULL END,
  jsonb_build_object('source', 'courier_market_localization_backfill', 'backfilled_at', NOW())
FROM courier_profiles cp
JOIN courier_market_configs cfg ON cfg.market_code = lower(COALESCE(NULLIF(cp.market_code, ''), 'id'))
ON CONFLICT (courier_profile_id, market_code) DO NOTHING;

-- Direct country/market edits are not accepted. A reviewed request and an
-- approved, policy-version-matched verification are required.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION guard_courier_market_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_config courier_market_configs%ROWTYPE;
  request_row courier_market_change_requests%ROWTYPE;
BEGIN
  NEW.market_code := lower(trim(COALESCE(NEW.market_code, 'id')));
  SELECT * INTO target_config FROM courier_market_configs WHERE market_code = NEW.market_code;
  IF NOT FOUND OR NOT target_config.is_active THEN
    RAISE EXCEPTION 'courier market % is not configured or active', NEW.market_code;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.market_code IS DISTINCT FROM OLD.market_code THEN
    IF NEW.is_online THEN
      RAISE EXCEPTION 'courier must be offline before changing market';
    END IF;
    IF NEW.market_change_request_id IS NULL THEN
      RAISE EXCEPTION 'market change requires a reviewed courier_market_change_requests record';
    END IF;
    SELECT * INTO request_row
    FROM courier_market_change_requests
    WHERE id = NEW.market_change_request_id
      AND courier_profile_id = NEW.id
      AND from_market_code = OLD.market_code
      AND target_market_code = NEW.market_code
      AND status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'market change request is not approved for this courier and target market';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM courier_market_verifications cmv
      WHERE cmv.courier_profile_id = NEW.id
        AND cmv.market_code = NEW.market_code
        AND cmv.status = 'approved'
        AND cmv.checked_policy_version = target_config.policy_version
        AND (cmv.expires_at IS NULL OR cmv.expires_at > NOW())
    ) THEN
      RAISE EXCEPTION 'target market regulatory verification is not approved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_guard_courier_market_assignment ON courier_profiles;
CREATE TRIGGER trg_guard_courier_market_assignment
BEFORE INSERT OR UPDATE OF market_code, market_change_request_id, is_online ON courier_profiles
FOR EACH ROW EXECUTE FUNCTION guard_courier_market_assignment();

-- Cross-border is represented as an explicit deny-by-default state. Turning on
-- a market flag never silently grants a courier permission.
INSERT INTO courier_cross_border_working_eligibility (
  courier_profile_id, origin_market_code, target_market_code, status, decision_reason
)
SELECT cp.id, lower(COALESCE(NULLIF(cp.market_code, ''), 'id')), cfg.market_code,
  'not_supported', 'Cross-border working requires a separate regulatory decision.'
FROM courier_profiles cp
JOIN courier_market_configs cfg ON cfg.market_code <> lower(COALESCE(NULLIF(cp.market_code, ''), 'id'))
WHERE cfg.cross_border_supported = FALSE
ON CONFLICT (courier_profile_id, origin_market_code, target_market_code) DO NOTHING;

-- +goose Down
DROP TRIGGER IF EXISTS trg_guard_courier_market_assignment ON courier_profiles;
DROP FUNCTION IF EXISTS guard_courier_market_assignment();

-- Restore the pre-011 capability function because its view dependency predates
-- this migration and must survive a rollback.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_capability_is_eligible(profile_id UUID, service_code_value TEXT, market_code_value TEXT DEFAULT NULL)
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
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM courier_service_capabilities csc
    WHERE csc.courier_profile_id = profile_id
      AND csc.service_code = service_code_value
      AND csc.status = 'enabled'
      AND (csc.effective_from IS NULL OR csc.effective_from <= CURRENT_DATE)
      AND (csc.expires_at IS NULL OR csc.expires_at >= CURRENT_DATE)
      AND ('*' = ANY(csc.market_scope) OR resolved_market IS NULL OR resolved_market = ANY(csc.market_scope))
      AND courier_profile_documents_eligible(profile_id)
      AND NOT courier_enforcement_is_active(profile_id, resolved_market, service_code_value)
  );
END;
$$;
-- +goose StatementEnd

DROP FUNCTION IF EXISTS courier_market_is_eligible(UUID, TEXT);
DROP FUNCTION IF EXISTS courier_market_eligibility(UUID, TEXT);
DROP TRIGGER IF EXISTS trg_localize_courier_ledger_row ON courier_earnings_ledger;
DROP FUNCTION IF EXISTS localize_courier_ledger_row();
DROP TRIGGER IF EXISTS trg_snapshot_courier_ledger_localization ON courier_earnings_ledger;
DROP FUNCTION IF EXISTS snapshot_courier_ledger_localization();
DROP TRIGGER IF EXISTS trg_localize_courier_payout_account_row ON courier_payout_accounts;
DROP FUNCTION IF EXISTS localize_courier_payout_account_row();
DROP TRIGGER IF EXISTS trg_localize_courier_payout_request_row ON courier_payout_requests;
DROP FUNCTION IF EXISTS localize_courier_payout_request_row();
ALTER TABLE courier_profiles DROP CONSTRAINT IF EXISTS courier_profiles_market_change_request_fk;
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS market_change_request_id;
ALTER TABLE courier_payout_requests
  ALTER COLUMN amount_idr SET NOT NULL,
  ALTER COLUMN fee_idr SET NOT NULL;
ALTER TABLE courier_payout_requests
  DROP COLUMN IF EXISTS amount_minor,
  DROP COLUMN IF EXISTS fee_minor,
  DROP COLUMN IF EXISTS net_amount_minor,
  DROP COLUMN IF EXISTS market_code,
  DROP COLUMN IF EXISTS currency_code;
ALTER TABLE courier_payout_accounts
  DROP COLUMN IF EXISTS market_code,
  DROP COLUMN IF EXISTS currency_code;
ALTER TABLE courier_earnings_ledger
  ALTER COLUMN amount_idr SET NOT NULL;
ALTER TABLE courier_earnings_ledger
  DROP COLUMN IF EXISTS amount_minor,
  DROP COLUMN IF EXISTS market_code,
  DROP COLUMN IF EXISTS currency_code,
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS display_locale;
DROP TABLE IF EXISTS courier_earning_localization_snapshots;
DROP TABLE IF EXISTS courier_cross_border_working_eligibility;
DROP TABLE IF EXISTS courier_market_change_requests;
DROP TABLE IF EXISTS courier_market_verifications;
DROP TABLE IF EXISTS courier_market_configs;
