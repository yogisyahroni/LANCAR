-- +goose Up
-- COURIER-2026-001: canonical courier profile ownership and onboarding state.
-- The repository has two historical schemas: fresh installs use
-- courier_profiles.verification_status, while an older local schema used
-- courier_profiles.status for that value. Normalize that ambiguity before
-- adding the operational status and canonical onboarding state.

CREATE TABLE IF NOT EXISTS courier_profile_onboarding_migration_meta (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  legacy_status_renamed BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO courier_profile_onboarding_migration_meta (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'courier_profiles'
      AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'courier_profiles'
      AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE courier_profiles RENAME COLUMN status TO verification_status;
    UPDATE courier_profile_onboarding_migration_meta
    SET legacy_status_renamed = TRUE, applied_at = NOW()
    WHERE id = TRUE;
  END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE courier_profiles
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(40) NOT NULL DEFAULT 'id',
  ADD COLUMN IF NOT EXISTS onboarding_policy_version VARCHAR(80) NOT NULL DEFAULT 'courier-profile-v1',
  ADD COLUMN IF NOT EXISTS home_zone_id UUID REFERENCES zones(id) ON DELETE SET NULL;

ALTER TABLE courier_profiles
  DROP CONSTRAINT IF EXISTS courier_profiles_verification_status_check,
  DROP CONSTRAINT IF EXISTS courier_profiles_verification_status_values_check,
  ADD CONSTRAINT courier_profiles_verification_status_values_check
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended'));

ALTER TABLE courier_profiles
  DROP CONSTRAINT IF EXISTS courier_profiles_status_check,
  ADD CONSTRAINT courier_profiles_status_check
    CHECK (status IN ('offline', 'online', 'busy', 'active', 'suspended', 'pending', 'inactive'));

ALTER TABLE courier_profiles
  DROP CONSTRAINT IF EXISTS courier_profiles_onboarding_status_check,
  ADD CONSTRAINT courier_profiles_onboarding_status_check
    CHECK (onboarding_status IN (
      'DRAFT', 'SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED',
      'NEEDS_UPDATE', 'SUSPENDED', 'DEACTIVATED'
    ));

CREATE INDEX IF NOT EXISTS idx_courier_profiles_onboarding_state
  ON courier_profiles(onboarding_status, market_code, application_channel);

CREATE TABLE IF NOT EXISTS courier_profile_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  from_state VARCHAR(30),
  to_state VARCHAR(30) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (to_state IN (
    'DRAFT', 'SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED',
    'NEEDS_UPDATE', 'SUSPENDED', 'DEACTIVATED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_courier_profile_status_history_profile
  ON courier_profile_status_history(courier_profile_id, created_at DESC);

-- Backfill the new dimensions from the existing canonical tables. Existing
-- approved + verified couriers retain service eligibility as legacy ACTIVE
-- records, while new/unreviewed applications enter SUBMITTED.
UPDATE courier_profiles cp
SET is_verified = TRUE,
    onboarding_checklist = cp.onboarding_checklist || jsonb_build_object(
      'policy_version', COALESCE(cp.onboarding_checklist->>'policy_version', 'courier-profile-v1'),
      'market_code', COALESCE(NULLIF(cp.onboarding_checklist->>'market_code', ''), LOWER(COALESCE(cp.market_code, 'id'))),
      'application_channel', cp.application_channel,
      'passed', TRUE,
      'legacy_backfill', TRUE
    )
WHERE cp.verification_status = 'approved'
  AND COALESCE(cp.is_verified, FALSE) = FALSE;

UPDATE courier_profiles cp
SET home_zone_id = COALESCE(
      cp.home_zone_id,
      cp.current_zone_id,
      (
        SELECT cz.zone_id
        FROM courier_zones cz
        WHERE cz.courier_id = cp.id
          AND cz.removed_at IS NULL
        ORDER BY cz.is_primary DESC, cz.assigned_at ASC
        LIMIT 1
      )
    ),
    market_code = COALESCE(NULLIF(LOWER(cp.market_code), ''), 'id'),
    onboarding_policy_version = COALESCE(NULLIF(cp.onboarding_policy_version, ''), 'courier-profile-v1');

UPDATE courier_profiles cp
SET onboarding_status = CASE
      WHEN cp.verification_status = 'approved'
       AND COALESCE(cp.is_verified, FALSE)
       AND u.status = 'active' THEN 'ACTIVE'
      WHEN cp.verification_status = 'rejected' THEN 'REJECTED'
      WHEN cp.onboarding_checklist <> '{}'::jsonb THEN 'SUBMITTED'
      ELSE 'DRAFT'
    END,
    status = CASE
      WHEN cp.verification_status = 'approved' AND u.status = 'active' THEN 'active'
      WHEN cp.verification_status = 'suspended' OR u.status = 'suspended' THEN 'suspended'
      ELSE 'offline'
    END
FROM users u
WHERE u.id = cp.user_id;

INSERT INTO courier_profile_status_history (
  courier_profile_id, from_state, to_state, reason, metadata
)
SELECT id, NULL, onboarding_status, 'COURIER-2026-001 legacy state backfill',
       jsonb_build_object('source', 'migration', 'policy_version', onboarding_policy_version)
FROM courier_profiles
ON CONFLICT DO NOTHING;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION enforce_courier_onboarding_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.onboarding_status = 'ACTIVE' AND (
    NEW.verification_status <> 'approved'
    OR COALESCE(NEW.is_verified, FALSE) = FALSE
    OR COALESCE((NEW.onboarding_checklist->>'passed')::BOOLEAN, FALSE) = FALSE
  ) THEN
    RAISE EXCEPTION 'courier activation requires approved verification, is_verified, and a passed onboarding checklist';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.onboarding_status IS DISTINCT FROM NEW.onboarding_status THEN
    IF NOT (
      (OLD.onboarding_status = 'DRAFT' AND NEW.onboarding_status IN ('DRAFT', 'SUBMITTED', 'DEACTIVATED')) OR
      (OLD.onboarding_status = 'SUBMITTED' AND NEW.onboarding_status IN ('SUBMITTED', 'VERIFYING', 'REJECTED', 'NEEDS_UPDATE')) OR
      (OLD.onboarding_status = 'VERIFYING' AND NEW.onboarding_status IN ('VERIFYING', 'ACTIVE', 'REJECTED', 'NEEDS_UPDATE')) OR
      (OLD.onboarding_status = 'ACTIVE' AND NEW.onboarding_status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')) OR
      (OLD.onboarding_status = 'REJECTED' AND NEW.onboarding_status IN ('REJECTED', 'DRAFT', 'SUBMITTED', 'NEEDS_UPDATE')) OR
      (OLD.onboarding_status = 'NEEDS_UPDATE' AND NEW.onboarding_status IN ('NEEDS_UPDATE', 'DRAFT', 'SUBMITTED', 'REJECTED')) OR
      (OLD.onboarding_status = 'SUSPENDED' AND NEW.onboarding_status IN ('SUSPENDED', 'ACTIVE', 'DEACTIVATED')) OR
      (OLD.onboarding_status = 'DEACTIVATED' AND NEW.onboarding_status = 'DEACTIVATED')
    ) THEN
      RAISE EXCEPTION 'invalid courier onboarding transition: % -> %', OLD.onboarding_status, NEW.onboarding_status;
    END IF;

    INSERT INTO courier_profile_status_history (
      courier_profile_id, from_state, to_state, actor_id, reason, metadata
    ) VALUES (
      NEW.id,
      OLD.onboarding_status,
      NEW.onboarding_status,
      NULLIF(current_setting('app.actor_id', TRUE), '')::UUID,
      NULLIF(current_setting('app.actor_reason', TRUE), ''),
      jsonb_build_object('source', 'courier_profile_state_trigger')
    );
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS courier_onboarding_state_guard ON courier_profiles;
CREATE TRIGGER courier_onboarding_state_guard
BEFORE INSERT OR UPDATE OF onboarding_status, verification_status, is_verified, onboarding_checklist
ON courier_profiles
FOR EACH ROW
EXECUTE FUNCTION enforce_courier_onboarding_state();

CREATE OR REPLACE VIEW courier_profile_canonical AS
SELECT
  cp.id,
  jsonb_build_object(
    'user_id', u.id,
    'nik', cp.nik
  ) AS identity,
  jsonb_build_object(
    'full_name', u.full_name,
    'email', u.email,
    'phone_number', u.phone_number
  ) AS contact,
  jsonb_build_object(
    'market_code', cp.market_code,
    'application_channel', cp.application_channel,
    'policy_version', cp.onboarding_policy_version
  ) AS market,
  jsonb_build_object(
    'home_zone_id', cp.home_zone_id,
    'operating_zone_id', cp.current_zone_id,
    'operating_zone_ids', COALESCE((
      SELECT jsonb_agg(cz.zone_id ORDER BY cz.is_primary DESC, cz.assigned_at ASC)
      FROM courier_zones cz
      WHERE cz.courier_id = cp.id AND cz.removed_at IS NULL
    ), '[]'::jsonb)
  ) AS zones,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(cv) ORDER BY cv.is_primary DESC, cv.created_at DESC)
    FROM courier_vehicles cv
    WHERE cv.courier_profile_id = cp.id
  ), '[]'::jsonb) AS vehicles,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(csc) ORDER BY csc.created_at ASC)
    FROM courier_service_capabilities csc
    WHERE csc.courier_profile_id = cp.id
  ), '[]'::jsonb) AS capabilities,
  jsonb_build_object(
    'onboarding_status', cp.onboarding_status,
    'verification_status', cp.verification_status,
    'is_verified', cp.is_verified,
    'verified_at', cp.verified_at
  ) AS verification
FROM courier_profiles cp
JOIN users u ON u.id = cp.user_id;

-- +goose Down
DROP VIEW IF EXISTS courier_profile_canonical;
DROP TRIGGER IF EXISTS courier_onboarding_state_guard ON courier_profiles;
DROP FUNCTION IF EXISTS enforce_courier_onboarding_state();
DROP INDEX IF EXISTS idx_courier_profile_status_history_profile;
DROP TABLE IF EXISTS courier_profile_status_history;
DROP INDEX IF EXISTS idx_courier_profiles_onboarding_state;

ALTER TABLE courier_profiles
  DROP CONSTRAINT IF EXISTS courier_profiles_onboarding_status_check,
  DROP CONSTRAINT IF EXISTS courier_profiles_status_check,
  DROP CONSTRAINT IF EXISTS courier_profiles_verification_status_values_check,
  DROP COLUMN IF EXISTS onboarding_status,
  DROP COLUMN IF EXISTS market_code,
  DROP COLUMN IF EXISTS onboarding_policy_version,
  DROP COLUMN IF EXISTS home_zone_id;

-- Restore the legacy local shape only when this migration had to rename its
-- old status column. Fresh installs retain the original verification_status.
-- +goose StatementBegin
DO $$
DECLARE
  renamed BOOLEAN := FALSE;
BEGIN
  SELECT legacy_status_renamed INTO renamed
  FROM courier_profile_onboarding_migration_meta
  WHERE id = TRUE;

  ALTER TABLE courier_profiles DROP COLUMN IF EXISTS status;
  IF COALESCE(renamed, FALSE)
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'courier_profiles'
         AND column_name = 'verification_status'
     ) THEN
    ALTER TABLE courier_profiles RENAME COLUMN verification_status TO status;
  END IF;
END $$;
-- +goose StatementEnd

DROP TABLE IF EXISTS courier_profile_onboarding_migration_meta;

