-- +goose Up
-- Temporary UAT setting: keep an online courier matchable for up to ten
-- minutes without an accepted heartbeat. The value is intentionally stored in
-- system_configs so Ops/Admin can change it without rebuilding the services.

INSERT INTO system_configs (key, value, description, category)
VALUES (
  'courier_presence_stale_after_seconds',
  '600'::jsonb,
  'Courier presence freshness window in seconds. UAT default: 10 minutes.',
  'courier'
)
ON CONFLICT (key) DO NOTHING;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_presence_stale_after_seconds()
RETURNS INTEGER
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE((
    SELECT GREATEST(
      30,
      LEAST(
        3600,
        CASE
          WHEN value #>> '{}' ~ '^[0-9]+$' THEN (value #>> '{}')::INTEGER
          ELSE 600
        END
      )
    )
    FROM system_configs
    WHERE key = 'courier_presence_stale_after_seconds'
  ), 600);
$$;
-- +goose StatementEnd

-- A NULL explicit argument means "read the current Admin setting". Existing
-- callers that pass a value remain supported for worker/tests and controlled
-- policy operations.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_presence_effective_state(
  profile_id UUID,
  stale_after_seconds INTEGER DEFAULT NULL
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
      OR cp.last_location_at < NOW() - make_interval(secs => GREATEST(COALESCE(stale_after_seconds, courier_presence_stale_after_seconds()), 1))
      OR COALESCE(cas.heartbeat_at, cp.last_location_at) < NOW() - make_interval(secs => GREATEST(COALESCE(stale_after_seconds, courier_presence_stale_after_seconds()), 1))
      THEN 'unavailable'
    ELSE 'online'
  END
  FROM courier_profiles cp
  LEFT JOIN courier_availability_state cas ON cas.courier_id = cp.id
  WHERE cp.id = profile_id;
$$;
-- +goose StatementEnd

-- Enforcement actions remain part of the canonical matchability decision.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_presence_is_matchable(
  profile_id UUID,
  stale_after_seconds INTEGER DEFAULT NULL
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION mark_stale_couriers_unavailable(
  stale_after_seconds INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  transitioned INTEGER := 0;
  effective_stale_after_seconds INTEGER := GREATEST(
    COALESCE(stale_after_seconds, courier_presence_stale_after_seconds()),
    1
  );
BEGIN
  WITH stale AS (
    SELECT cp.id
    FROM courier_profiles cp
    LEFT JOIN courier_availability_state cas ON cas.courier_id = cp.id
    WHERE cp.is_online = TRUE
      AND (
        cp.current_location IS NULL
        OR cp.last_location_at IS NULL
        OR cp.last_location_at < NOW() - make_interval(secs => effective_stale_after_seconds)
        OR COALESCE(cas.heartbeat_at, cp.last_location_at) < NOW() - make_interval(secs => effective_stale_after_seconds)
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
           OR cp.last_location_at < NOW() - make_interval(secs => courier_presence_stale_after_seconds())
           OR COALESCE(cas.heartbeat_at, cp.last_location_at) < NOW() - make_interval(secs => courier_presence_stale_after_seconds())
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
-- Restore the original 120-second policy if this UAT override is rolled back.
DELETE FROM system_configs WHERE key = 'courier_presence_stale_after_seconds';

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

DROP FUNCTION IF EXISTS courier_presence_stale_after_seconds();

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
