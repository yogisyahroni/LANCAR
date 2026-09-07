-- +goose Up
-- COURIER-2026-009: auditable account/market/capability enforcement with
-- safe active-job handling, courier-visible reasons, appeals and restricted
-- reinstatement. Existing onboarding/capability tables remain the state
-- sources; this table is the policy overlay consulted by matching.

CREATE TABLE IF NOT EXISTS courier_enforcement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  enforcement_type VARCHAR(20) NOT NULL
    CHECK (enforcement_type IN ('suspension', 'restriction')),
  scope VARCHAR(20) NOT NULL
    CHECK (scope IN ('account', 'market', 'capability')),
  market_code VARCHAR(40),
  service_code VARCHAR(100) REFERENCES delivery_service_products(code) ON DELETE RESTRICT,
  reason_category VARCHAR(40) NOT NULL
    CHECK (reason_category IN ('safety', 'fraud_integrity', 'document_compliance', 'quality', 'market_policy', 'availability', 'other')),
  reason_detail TEXT NOT NULL CHECK (char_length(btrim(reason_detail)) BETWEEN 10 AND 2000),
  courier_message TEXT CHECK (courier_message IS NULL OR char_length(courier_message) <= 500),
  disclosure_level VARCHAR(30) NOT NULL DEFAULT 'actionable'
    CHECK (disclosure_level IN ('actionable', 'security_restricted')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  safe_job_policy VARCHAR(40) NOT NULL DEFAULT 'allow_active_job_completion'
    CHECK (safe_job_policy IN ('allow_active_job_completion', 'reassign_unpicked_jobs', 'immediate_safety_stop')),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('scheduled', 'pending_safe_completion', 'active', 'revoked', 'expired')),
  restoration_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (
    (scope = 'account' AND market_code IS NULL AND service_code IS NULL)
    OR (scope = 'market' AND market_code IS NOT NULL AND service_code IS NULL)
    OR (scope = 'capability' AND market_code IS NULL AND service_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_courier_enforcement_active_lookup
  ON courier_enforcement_actions(courier_profile_id, scope, status, effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_courier_enforcement_market_lookup
  ON courier_enforcement_actions(courier_profile_id, market_code, status)
  WHERE scope = 'market';
CREATE INDEX IF NOT EXISTS idx_courier_enforcement_capability_lookup
  ON courier_enforcement_actions(courier_profile_id, service_code, status)
  WHERE scope = 'capability';

CREATE TABLE IF NOT EXISTS courier_enforcement_action_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enforcement_action_id UUID NOT NULL REFERENCES courier_enforcement_actions(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL
    CHECK (event_type IN ('created', 'safe_completion_pending', 'reassignment_requested', 'activated', 'revoked', 'expired', 'appeal_submitted', 'appeal_reviewed')),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_enforcement_events_action
  ON courier_enforcement_action_events(enforcement_action_id, created_at ASC);

CREATE TABLE IF NOT EXISTS courier_enforcement_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enforcement_action_id UUID NOT NULL REFERENCES courier_enforcement_actions(id) ON DELETE CASCADE,
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected')),
  review_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_enforcement_appeals_courier
  ON courier_enforcement_appeals(courier_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courier_enforcement_appeals_review_queue
  ON courier_enforcement_appeals(status, submitted_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_courier_enforcement_appeals_open
  ON courier_enforcement_appeals(enforcement_action_id)
  WHERE status IN ('submitted', 'in_review');

-- A pending safe-completion action blocks new matching while preserving access
-- to the current job. Future actions do not block until their effective time.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_enforcement_is_active(
  profile_id UUID,
  market_code_value TEXT DEFAULT NULL,
  service_code_value TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM courier_enforcement_actions cea
    WHERE cea.courier_profile_id = profile_id
      AND cea.status IN ('active', 'pending_safe_completion', 'scheduled')
      AND cea.effective_from <= NOW()
      AND (cea.effective_until IS NULL OR cea.effective_until > NOW())
      AND (
        cea.scope = 'account'
        OR (cea.scope = 'market' AND NULLIF(LOWER(market_code_value), '') IS NOT NULL
            AND LOWER(cea.market_code) = LOWER(market_code_value))
        OR (cea.scope = 'capability' AND NULLIF(LOWER(service_code_value), '') IS NOT NULL
            AND LOWER(cea.service_code) = LOWER(service_code_value))
      )
  );
$$;
-- +goose StatementEnd

-- Matching must consult this overlay in addition to certification/document
-- rules. Reinstatement never re-enables an unapproved capability.
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
      AND NOT courier_enforcement_is_active(profile_id, resolved_market, service_code_value)
  );
END;
$$;
-- +goose StatementEnd

-- Account and market actions must stop new matching without changing the
-- active-work state machine used to complete or safely hand off current jobs.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_presence_is_matchable(
  profile_id UUID,
  stale_after_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    courier_presence_effective_state(profile_id, stale_after_seconds) = 'online'
    AND NOT courier_enforcement_is_active(profile_id, NULL, NULL),
    FALSE
  );
$$;
-- +goose StatementEnd

-- Promote due scheduled actions through the same policy boundary used by the
-- admin API. A future action remains visible but cannot affect matching until
-- effective_from; once due it either waits for safe completion or activates.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION activate_scheduled_courier_enforcement_actions()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  action_row RECORD;
  active_jobs INTEGER;
  next_status TEXT;
  activated INTEGER := 0;
BEGIN
  FOR action_row IN
    SELECT cea.*,
           cp.user_id,
           cp.onboarding_status,
           cp.verification_status,
           cp.is_verified
    FROM courier_enforcement_actions cea
    JOIN courier_profiles cp ON cp.id = cea.courier_profile_id
    WHERE cea.status = 'scheduled'
      AND cea.effective_from <= NOW()
      AND (cea.effective_until IS NULL OR cea.effective_until > NOW())
    FOR UPDATE OF cea, cp
  LOOP
    SELECT COUNT(*)::int INTO active_jobs
    FROM order_legs ol
    WHERE ol.courier_id = action_row.user_id
      AND COALESCE(ol.status, '') NOT IN ('delivered', 'completed', 'failed', 'cancelled', 'rejected', 'return_required');

    next_status := 'active';
    IF action_row.scope = 'account'
       AND action_row.enforcement_type = 'suspension'
       AND action_row.safe_job_policy <> 'immediate_safety_stop'
       AND active_jobs > 0 THEN
      next_status := 'pending_safe_completion';
    END IF;

    UPDATE courier_enforcement_actions
    SET status = next_status, updated_at = NOW()
    WHERE id = action_row.id;

    IF next_status = 'active'
       AND action_row.scope = 'capability'
       AND action_row.restoration_snapshot->'capability'->>'status' = 'enabled' THEN
      UPDATE courier_service_capabilities
      SET status = CASE WHEN action_row.enforcement_type = 'restriction' THEN 'paused' ELSE 'suspended' END,
          eligibility_reason = action_row.reason_detail,
          suspension_reason = action_row.reason_detail,
          paused_at = NOW(),
          paused_by = action_row.created_by,
          updated_at = NOW()
      WHERE courier_profile_id = action_row.courier_profile_id
        AND LOWER(service_code) = LOWER(action_row.service_code)
        AND status = 'enabled';
    END IF;

    IF next_status = 'active'
       AND action_row.scope = 'account'
       AND action_row.enforcement_type = 'suspension' THEN
      PERFORM set_config('app.actor_id', action_row.created_by::text, TRUE);
      PERFORM set_config('app.actor_reason', 'Scheduled courier account suspension activated', TRUE);
      UPDATE users SET status = 'suspended', updated_at = NOW()
      WHERE id = action_row.user_id AND status = 'active';
      UPDATE courier_profiles
      SET onboarding_status = CASE WHEN onboarding_status = 'ACTIVE' THEN 'SUSPENDED' ELSE onboarding_status END,
          verification_status = CASE WHEN verification_status = 'approved' THEN 'suspended' ELSE verification_status END,
          is_verified = CASE WHEN onboarding_status = 'ACTIVE' THEN FALSE ELSE is_verified END,
          status = 'suspended', is_online = FALSE, reviewed_at = NOW(), reviewed_by = action_row.created_by,
          updated_at = NOW()
      WHERE id = action_row.courier_profile_id;
    END IF;

    INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
    VALUES (
      action_row.id,
      CASE WHEN next_status = 'pending_safe_completion' THEN 'safe_completion_pending' ELSE 'activated' END,
      action_row.created_by,
      jsonb_build_object('source', 'scheduled_enforcement_activation', 'active_job_count', active_jobs)
    );
    activated := activated + 1;
  END LOOP;
  RETURN activated;
END;
$$;
-- +goose StatementEnd

-- Finalize account suspensions once an allowed active job has safely reached a
-- terminal state. The trigger below calls this after an order-leg transition;
-- API reads also call it so the policy converges even in an idle worker setup.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION finalize_pending_courier_enforcement_actions()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  action_row RECORD;
  remaining_jobs INTEGER;
  finalized INTEGER := 0;
BEGIN
  FOR action_row IN
    SELECT cea.*
    FROM courier_enforcement_actions cea
    WHERE cea.status = 'pending_safe_completion'
      AND cea.effective_from <= NOW()
      AND (cea.effective_until IS NULL OR cea.effective_until > NOW())
      AND NOT EXISTS (
        SELECT 1
        FROM order_legs ol
        WHERE ol.courier_id = (SELECT cp.user_id FROM courier_profiles cp WHERE cp.id = cea.courier_profile_id)
          AND COALESCE(ol.status, '') NOT IN ('delivered', 'completed', 'failed', 'cancelled', 'rejected', 'return_required')
      )
    FOR UPDATE
  LOOP
    UPDATE courier_enforcement_actions
    SET status = 'active', updated_at = NOW()
    WHERE id = action_row.id;

    IF action_row.scope = 'account' AND action_row.enforcement_type = 'suspension' THEN
      PERFORM set_config('app.actor_id', action_row.created_by::text, TRUE);
      PERFORM set_config('app.actor_reason', 'Safe active-job completion finished; account suspension activated', TRUE);

      UPDATE users
      SET status = 'suspended', updated_at = NOW()
      WHERE id = (SELECT cp.user_id FROM courier_profiles cp WHERE cp.id = action_row.courier_profile_id)
        AND status = 'active';

      UPDATE courier_profiles
      SET onboarding_status = CASE WHEN onboarding_status = 'ACTIVE' THEN 'SUSPENDED' ELSE onboarding_status END,
          verification_status = CASE WHEN verification_status = 'approved' THEN 'suspended' ELSE verification_status END,
          is_verified = CASE WHEN onboarding_status = 'ACTIVE' THEN FALSE ELSE is_verified END,
          status = 'suspended',
          is_online = FALSE,
          reviewed_at = NOW(),
          reviewed_by = action_row.created_by,
          updated_at = NOW()
      WHERE id = action_row.courier_profile_id;
    END IF;

    INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
    VALUES (action_row.id, 'activated', action_row.created_by,
            jsonb_build_object('source', 'safe_completion_finalizer'));
    finalized := finalized + 1;
  END LOOP;

  RETURN finalized;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_courier_enforcement_actions()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  changed INTEGER := 0;
BEGIN
  changed := changed + activate_scheduled_courier_enforcement_actions();
  changed := changed + finalize_pending_courier_enforcement_actions();
  RETURN changed;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION finalize_courier_enforcement_after_leg_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM finalize_pending_courier_enforcement_actions();
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS courier_enforcement_finalize_after_leg_update ON order_legs;
CREATE TRIGGER courier_enforcement_finalize_after_leg_update
  AFTER UPDATE OF status ON order_legs
  FOR EACH STATEMENT
  EXECUTE FUNCTION finalize_courier_enforcement_after_leg_update();

-- +goose Down
DROP TRIGGER IF EXISTS courier_enforcement_finalize_after_leg_update ON order_legs;
DROP FUNCTION IF EXISTS finalize_courier_enforcement_after_leg_update();
DROP FUNCTION IF EXISTS refresh_courier_enforcement_actions();
DROP FUNCTION IF EXISTS finalize_pending_courier_enforcement_actions();
DROP FUNCTION IF EXISTS activate_scheduled_courier_enforcement_actions();

-- Restore the previous presence matcher before removing the enforcement table.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_presence_is_matchable(
  profile_id UUID,
  stale_after_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(courier_presence_effective_state(profile_id, stale_after_seconds) = 'online', FALSE);
$$;
-- +goose StatementEnd

-- Restore the previous capability matcher before removing its policy dependency.
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

DROP FUNCTION IF EXISTS courier_enforcement_is_active(UUID, TEXT, TEXT);
DROP INDEX IF EXISTS uq_courier_enforcement_appeals_open;
DROP INDEX IF EXISTS idx_courier_enforcement_appeals_review_queue;
DROP INDEX IF EXISTS idx_courier_enforcement_appeals_courier;
DROP TABLE IF EXISTS courier_enforcement_appeals;
DROP INDEX IF EXISTS idx_courier_enforcement_events_action;
DROP TABLE IF EXISTS courier_enforcement_action_events;
DROP INDEX IF EXISTS idx_courier_enforcement_capability_lookup;
DROP INDEX IF EXISTS idx_courier_enforcement_market_lookup;
DROP INDEX IF EXISTS idx_courier_enforcement_active_lookup;
DROP TABLE IF EXISTS courier_enforcement_actions;
