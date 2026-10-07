-- Per-service opt-in belongs to the courier, while csc.status remains the
-- admin-controlled certification state. Turning a service off must not revoke
-- approval or change the capability review history.

-- +goose Up
ALTER TABLE courier_service_capabilities
  ADD COLUMN IF NOT EXISTS courier_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_courier_service_capabilities_courier_enabled
  ON courier_service_capabilities(courier_profile_id, courier_enabled);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_service_is_enabled(
  profile_id UUID,
  service_code_value TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE((
    SELECT csc.courier_enabled
      FROM courier_service_capabilities csc
     WHERE csc.courier_profile_id = profile_id
       AND csc.service_code = service_code_value
     LIMIT 1
  ), TRUE);
$$;
-- +goose StatementEnd

-- Keep the existing admin/certification gate intact and add the courier's
-- opt-in as a final server-side matching guard.
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
  IF NOT FOUND THEN RETURN FALSE; END IF;

  RETURN courier_market_is_eligible(profile_id, resolved_market)
    AND courier_capability_vehicle_is_eligible(profile_id, service_code_value)
    AND courier_service_equipment_is_eligible(profile_id, service_code_value)
    AND courier_service_pricing_is_ready(profile_id, service_code_value)
    AND courier_service_is_enabled(profile_id, service_code_value)
    AND EXISTS (
      SELECT 1
        FROM courier_service_capabilities csc
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

-- +goose Down
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
  IF NOT FOUND THEN RETURN FALSE; END IF;

  RETURN courier_market_is_eligible(profile_id, resolved_market)
    AND courier_capability_vehicle_is_eligible(profile_id, service_code_value)
    AND courier_service_equipment_is_eligible(profile_id, service_code_value)
    AND courier_service_pricing_is_ready(profile_id, service_code_value)
    AND EXISTS (
      SELECT 1
        FROM courier_service_capabilities csc
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

DROP FUNCTION IF EXISTS courier_service_is_enabled(UUID, TEXT);
DROP INDEX IF EXISTS idx_courier_service_capabilities_courier_enabled;
ALTER TABLE courier_service_capabilities
  DROP COLUMN IF EXISTS courier_enabled;
