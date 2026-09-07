-- +goose Up
-- COURIER-2026-004: separate operational presence from active-work state.
-- `courier_profiles.is_online` remains the compatibility projection for
-- operational presence. `courier_availability_state.current_state` remains
-- the active-job state. The fields below add an explicit server policy for
-- break/limited/unavailable presence and heartbeat freshness.

ALTER TABLE courier_availability_state
  ADD COLUMN IF NOT EXISTS presence_state VARCHAR(20) NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS presence_reason TEXT,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_transition_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE courier_availability_state
  DROP CONSTRAINT IF EXISTS courier_availability_presence_state_check_2026,
  ADD CONSTRAINT courier_availability_presence_state_check_2026
    CHECK (presence_state IN ('offline', 'online', 'break', 'limited', 'unavailable'));

UPDATE courier_availability_state cas
SET presence_state = CASE WHEN cp.is_online THEN 'online' ELSE 'offline' END,
    heartbeat_at = COALESCE(cas.heartbeat_at, cp.last_location_at),
    last_transition_at = COALESCE(cas.last_transition_at, cas.updated_at, NOW())
FROM courier_profiles cp
WHERE cp.id = cas.courier_id;

CREATE INDEX IF NOT EXISTS idx_courier_availability_presence_policy
  ON courier_availability_state (presence_state, heartbeat_at, updated_at);

-- The policy is deliberately derived from both the compatibility profile and
-- the state row. This keeps every matching caller server-authoritative while
-- allowing a stale courier to recover on the next accepted heartbeat.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_presence_effective_state(
  profile_id UUID,
  stale_after_seconds INTEGER DEFAULT 120
)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
    WHEN COALESCE(cas.presence_state, CASE WHEN cp.is_online THEN 'online' ELSE 'offline' END)
           IN ('offline', 'break', 'limited')
      THEN COALESCE(cas.presence_state, 'offline')
    WHEN COALESCE(cas.presence_state, 'online') = 'unavailable'
         AND cas.presence_reason IS DISTINCT FROM 'heartbeat_or_location_stale'
      THEN 'unavailable'
    WHEN cp.is_online IS DISTINCT FROM TRUE
      THEN 'offline'
    WHEN cp.current_location IS NULL
      OR cp.last_location_at IS NULL
      OR cp.last_location_at < NOW() - make_interval(secs => GREATEST(stale_after_seconds, 1))
      OR COALESCE(cas.heartbeat_at, cp.last_location_at) < NOW() - make_interval(secs => GREATEST(stale_after_seconds, 1))
      THEN 'unavailable'
    ELSE 'online'
  END
  FROM courier_profiles cp
  LEFT JOIN courier_availability_state cas ON cas.courier_id = cp.id
  WHERE cp.id = profile_id;
$$;
-- +goose StatementEnd

-- Matching must use this function instead of trusting a client-side toggle.
-- `FALSE` also covers absent profile, missing location, break, limited, and
-- stale heartbeat/location.
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

-- Persist the policy transition so the admin/courier surfaces can explain
-- why the courier stopped receiving work. The profile boolean is not flipped:
-- it remains the courier's requested duty projection and a fresh heartbeat can
-- recover an automatically-staled row without losing that intent.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION mark_stale_couriers_unavailable(
  stale_after_seconds INTEGER DEFAULT 120
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  transitioned INTEGER := 0;
BEGIN
  WITH stale AS (
    SELECT cp.id
    FROM courier_profiles cp
    LEFT JOIN courier_availability_state cas ON cas.courier_id = cp.id
    WHERE cp.is_online = TRUE
      AND (
        cp.current_location IS NULL
        OR cp.last_location_at IS NULL
        OR cp.last_location_at < NOW() - make_interval(secs => GREATEST(stale_after_seconds, 1))
        OR COALESCE(cas.heartbeat_at, cp.last_location_at) < NOW() - make_interval(secs => GREATEST(stale_after_seconds, 1))
      )
      AND COALESCE(cas.presence_state, 'online') = 'online'
  )
  INSERT INTO courier_availability_state (
    courier_id, presence_state, presence_reason, heartbeat_at, last_transition_at, updated_at
  )
  SELECT id, 'unavailable', 'heartbeat_or_location_stale', NULL, NOW(), NOW()
  FROM stale
  ON CONFLICT (courier_id) DO UPDATE SET
    presence_state = 'unavailable',
    presence_reason = 'heartbeat_or_location_stale',
    last_transition_at = NOW(),
    updated_at = NOW()
  WHERE courier_availability_state.presence_state = 'online';

  GET DIAGNOSTICS transitioned = ROW_COUNT;
  RETURN transitioned;
END;
$$;
-- +goose StatementEnd

CREATE OR REPLACE VIEW courier_presence_snapshot AS
SELECT
  cp.id AS courier_profile_id,
  cp.user_id,
  cp.is_online,
  COALESCE(cas.presence_state, CASE WHEN cp.is_online THEN 'online' ELSE 'offline' END) AS presence_state,
  courier_presence_effective_state(cp.id) AS effective_presence_state,
  CASE
    WHEN courier_presence_effective_state(cp.id) = 'unavailable'
         AND cp.is_online = TRUE
         AND (
           cp.current_location IS NULL
           OR cp.last_location_at IS NULL
           OR cp.last_location_at < NOW() - INTERVAL '120 seconds'
           OR COALESCE(cas.heartbeat_at, cp.last_location_at) < NOW() - INTERVAL '120 seconds'
         )
      THEN 'heartbeat_or_location_stale'
    ELSE cas.presence_reason
  END AS presence_reason,
  cas.heartbeat_at,
  cp.last_location_at,
  COALESCE(jobs.derived_work_state, cas.current_state, 'idle') AS work_state,
  COALESCE(jobs.active_job_count, 0) AS active_job_count,
  cas.active_order_id,
  cas.active_order_type,
  courier_presence_is_matchable(cp.id) AS is_matchable,
  cas.last_transition_at,
  cas.updated_at
FROM courier_profiles cp
LEFT JOIN courier_availability_state cas ON cas.courier_id = cp.id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS active_job_count,
    CASE
      WHEN COUNT(*) = 0 THEN 'idle'
      WHEN COUNT(*) > 1 THEN 'batching'
      ELSE COALESCE(
        MAX(CASE
          WHEN COALESCE(ol.status, o.status) IN ('picked_up', 'in_progress') THEN 'picked_up'
          WHEN COALESCE(ol.status, o.status) IN ('in_transit', 'loading', 'unloading', 'arrived_dropoff') THEN 'in_transit'
          WHEN COALESCE(ol.status, o.status) IN ('accepted', 'assigned', 'going_to_pickup', 'pickup_pending', 'arrived_pickup', 'service_started') THEN 'assigned'
          ELSE NULL
        END),
        cas.current_state,
        'assigned'
      )
    END AS derived_work_state
  FROM order_legs ol
  JOIN orders o ON o.id = ol.order_id
  WHERE ol.courier_id = cp.user_id
    AND COALESCE(ol.status, o.status) NOT IN (
      'delivered', 'completed', 'failed', 'cancelled', 'rejected', 'return_required'
    )
) jobs ON TRUE;

-- +goose Down
DROP VIEW IF EXISTS courier_presence_snapshot;
DROP FUNCTION IF EXISTS mark_stale_couriers_unavailable(INTEGER);
DROP FUNCTION IF EXISTS courier_presence_is_matchable(UUID, INTEGER);
DROP FUNCTION IF EXISTS courier_presence_effective_state(UUID, INTEGER);
DROP INDEX IF EXISTS idx_courier_availability_presence_policy;
ALTER TABLE courier_availability_state
  DROP CONSTRAINT IF EXISTS courier_availability_presence_state_check_2026,
  DROP COLUMN IF EXISTS last_transition_at,
  DROP COLUMN IF EXISTS heartbeat_at,
  DROP COLUMN IF EXISTS presence_reason,
  DROP COLUMN IF EXISTS presence_state;
