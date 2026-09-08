-- +goose Up
-- GLOB-2026-001: canonical market configuration stays in the existing
-- admin/configuration ownership boundary.  Provider credentials are never
-- stored in these tables; only public capability identifiers and policy refs
-- are persisted.

CREATE TABLE IF NOT EXISTS market_configs (
  market_code VARCHAR(32) PRIMARY KEY,
  country_code VARCHAR(2) NOT NULL,
  region_code VARCHAR(32) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  currency_minor_unit SMALLINT NOT NULL DEFAULT 0,
  default_locale VARCHAR(35) NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  measurement_system VARCHAR(16) NOT NULL,
  phone_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  address_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  logistics_providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  map_providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  tax_policy_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  insurance_policy_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  launch_state VARCHAR(24) NOT NULL DEFAULT 'draft',
  config_version INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rollback_version INTEGER,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'draft',
  approval_reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_configs_market_code_ck CHECK (market_code = lower(btrim(market_code)) AND market_code ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  CONSTRAINT market_configs_country_code_ck CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT market_configs_region_code_ck CHECK (region_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  CONSTRAINT market_configs_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT market_configs_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3),
  CONSTRAINT market_configs_measurement_system_ck CHECK (measurement_system IN ('metric', 'imperial')),
  CONSTRAINT market_configs_launch_state_ck CHECK (launch_state IN ('draft', 'scheduled', 'active', 'paused', 'retired')),
  CONSTRAINT market_configs_approval_status_ck CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  CONSTRAINT market_configs_version_ck CHECK (config_version > 0),
  CONSTRAINT market_configs_rollback_ck CHECK (rollback_version IS NULL OR (rollback_version > 0 AND rollback_version < config_version)),
  CONSTRAINT market_configs_phone_rules_object_ck CHECK (jsonb_typeof(phone_rules) = 'object'),
  CONSTRAINT market_configs_address_rules_object_ck CHECK (jsonb_typeof(address_rules) = 'object'),
  CONSTRAINT market_configs_payment_methods_array_ck CHECK (jsonb_typeof(payment_methods) = 'array'),
  CONSTRAINT market_configs_logistics_providers_array_ck CHECK (jsonb_typeof(logistics_providers) = 'array'),
  CONSTRAINT market_configs_map_providers_array_ck CHECK (jsonb_typeof(map_providers) = 'array'),
  CONSTRAINT market_configs_tax_policy_refs_array_ck CHECK (jsonb_typeof(tax_policy_refs) = 'array'),
  CONSTRAINT market_configs_insurance_policy_refs_array_ck CHECK (jsonb_typeof(insurance_policy_refs) = 'array'),
  CONSTRAINT market_configs_service_hours_object_ck CHECK (jsonb_typeof(service_hours) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_market_configs_launch_state
  ON market_configs (launch_state, approval_status, effective_from);

CREATE TABLE IF NOT EXISTS market_service_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE CASCADE,
  city_code VARCHAR(64) NOT NULL,
  service_code VARCHAR(64) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  service_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_version INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rollback_version INTEGER,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_service_availability_city_ck CHECK (city_code = lower(btrim(city_code)) AND city_code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  CONSTRAINT market_service_availability_service_ck CHECK (service_code = lower(btrim(service_code)) AND service_code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  CONSTRAINT market_service_availability_version_ck CHECK (config_version > 0),
  CONSTRAINT market_service_availability_rollback_ck CHECK (rollback_version IS NULL OR (rollback_version > 0 AND rollback_version < config_version)),
  CONSTRAINT market_service_availability_hours_object_ck CHECK (jsonb_typeof(service_hours) = 'object'),
  CONSTRAINT market_service_availability_policy_object_ck CHECK (jsonb_typeof(policy_refs) = 'object'),
  UNIQUE (market_code, city_code, service_code)
);

CREATE INDEX IF NOT EXISTS idx_market_service_availability_lookup
  ON market_service_availability (market_code, city_code, is_enabled, service_code);

CREATE TABLE IF NOT EXISTS market_legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE CASCADE,
  document_type VARCHAR(32) NOT NULL,
  locale VARCHAR(35) NOT NULL,
  version VARCHAR(64) NOT NULL,
  document_uri TEXT NOT NULL,
  content_hash VARCHAR(128),
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  effective_from TIMESTAMPTZ NOT NULL,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_legal_documents_status_ck CHECK (status IN ('draft', 'approved', 'retired')),
  UNIQUE (market_code, document_type, locale, version)
);

CREATE INDEX IF NOT EXISTS idx_market_legal_documents_active
  ON market_legal_documents (market_code, document_type, locale, status, effective_from);

CREATE TABLE IF NOT EXISTS market_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(32) NOT NULL REFERENCES market_configs(market_code) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL,
  actor_id UUID,
  reason TEXT,
  correlation_id VARCHAR(128),
  previous_version INTEGER,
  new_version INTEGER,
  previous_config JSONB,
  new_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_config_audit_lookup
  ON market_config_audit (market_code, created_at DESC);

-- Audit rows are append-only.  A delete/update would destroy the approval and
-- rollback trail required by the market launch gate.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_market_config_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'market_config_audit is append-only';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_market_config_audit_immutable ON market_config_audit;
CREATE TRIGGER trg_market_config_audit_immutable
  BEFORE UPDATE OR DELETE ON market_config_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_market_config_audit_mutation();

-- Single database-level readiness decision used by the public resolver.  It
-- intentionally has no Indonesia fallback: an unknown/incomplete market is
-- an unavailable transactional market.
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

-- Production baseline: Indonesia/Jakarta is real operating configuration, not
-- a demo order/customer/courier seed.  Additional markets must be created and
-- approved through the admin control plane.
INSERT INTO market_configs (
  market_code, country_code, region_code, currency_code, currency_minor_unit,
  default_locale, timezone, measurement_system, phone_rules, address_rules,
  payment_methods, logistics_providers, map_providers, tax_policy_refs,
  insurance_policy_refs, service_hours, launch_state, config_version,
  effective_from, approval_status, approval_reason
)
VALUES (
  'id-jk', 'ID', 'ID-JK', 'IDR', 0, 'id-ID', 'Asia/Jakarta', 'metric',
  '{"country_calling_code": "+62", "national_length": {"min": 9, "max": 13}, "mobile_prefixes": ["08", "628", "+628"]}'::jsonb,
  '{"required_fields": ["label", "address", "latitude", "longitude"], "postal_code": {"required": false, "pattern": "^[0-9]{5}$"}}'::jsonb,
  '["qris", "bank_transfer", "cash"]'::jsonb,
  '[{"code": "lancar", "services": ["package_on_demand", "food", "tambal_ban", "towing"]}, {"code": "jne", "services": ["aggregator"]}, {"code": "jnt", "services": ["aggregator"]}]'::jsonb,
  '[{"code": "openstreetmap", "route_profiles": ["motorcycle", "car"]}]'::jsonb,
  '["id-ppn-v1"]'::jsonb,
  '["lancar-standard-insurance-v1"]'::jsonb,
  '{"default": {"days": [1, 2, 3, 4, 5, 6, 7], "opens": "00:00", "closes": "23:59", "timezone": "Asia/Jakarta"}}'::jsonb,
  'active', 1, NOW(), 'approved', 'Initial Indonesia/Jakarta operating policy'
)
ON CONFLICT (market_code) DO NOTHING;

INSERT INTO market_service_availability (market_code, city_code, service_code, is_enabled, service_hours, policy_refs)
VALUES
  ('id-jk', 'jakarta', 'package_on_demand', TRUE, '{"inherits": "market_default"}'::jsonb, '{"coverage": "authoritative_zone_resolver"}'::jsonb),
  ('id-jk', 'jakarta', 'food', TRUE, '{"inherits": "market_default"}'::jsonb, '{"coverage": "merchant_serviceability"}'::jsonb),
  ('id-jk', 'jakarta', 'tambal_ban', TRUE, '{"inherits": "market_default"}'::jsonb, '{"coverage": "courier_capability"}'::jsonb),
  ('id-jk', 'jakarta', 'towing', TRUE, '{"inherits": "market_default"}'::jsonb, '{"coverage": "courier_capability"}'::jsonb),
  ('id-jk', 'jakarta', 'aggregator', TRUE, '{"inherits": "market_default"}'::jsonb, '{"coverage": "provider_registry"}'::jsonb)
ON CONFLICT (market_code, city_code, service_code) DO NOTHING;

INSERT INTO market_legal_documents (market_code, document_type, locale, version, document_uri, status, effective_from)
VALUES
  ('id-jk', 'terms', 'id-ID', 'terms-id-jk-v1', '/legal/terms', 'approved', NOW()),
  ('id-jk', 'privacy', 'id-ID', 'privacy-id-jk-v1', '/legal/privacy', 'approved', NOW())
ON CONFLICT (market_code, document_type, locale, version) DO NOTHING;

INSERT INTO market_config_audit (market_code, action, reason, previous_version, new_version, new_config)
SELECT 'id-jk', 'seed', 'Initial Indonesia/Jakarta operating policy', NULL, 1,
       to_jsonb(mc) - 'created_by' - 'updated_by'
FROM market_configs mc
WHERE mc.market_code = 'id-jk'
  AND NOT EXISTS (SELECT 1 FROM market_config_audit WHERE market_code = 'id-jk');

-- +goose Down
DROP TRIGGER IF EXISTS trg_market_config_audit_immutable ON market_config_audit;
DROP FUNCTION IF EXISTS prevent_market_config_audit_mutation();
DROP FUNCTION IF EXISTS market_config_readiness(TEXT, TEXT);
DROP TABLE IF EXISTS market_config_audit;
DROP TABLE IF EXISTS market_legal_documents;
DROP TABLE IF EXISTS market_service_availability;
DROP TABLE IF EXISTS market_configs;
