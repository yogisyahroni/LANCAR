-- +goose Up
-- Keep legacy installations on the repository that actually publishes the
-- Courier APK. Do not overwrite an administrator-selected custom URL.
UPDATE system_configs
SET value = to_jsonb('https://github.com/yogisyahroni/LANCAR/releases'::text),
    description = 'URL to open the latest mobile release'
WHERE key = 'mobile_update_url'
  AND value #>> '{}' = 'https://github.com/yogisyahroni/TEMBUS/releases';

WITH candidates AS (
  SELECT id, to_jsonb(mrp) - 'id' AS previous_policy
  FROM mobile_release_policies mrp
  WHERE mrp.store_destinations #>> '{primary}' = 'https://github.com/yogisyahroni/TEMBUS/releases'
), changed AS (
  UPDATE mobile_release_policies mrp
  SET store_destinations = jsonb_set(
        COALESCE(mrp.store_destinations, '{}'::jsonb),
        '{primary}',
        to_jsonb('https://github.com/yogisyahroni/LANCAR/releases'::text),
        TRUE
      ),
      revision = mrp.revision + 1,
      updated_at = NOW()
  FROM candidates
  WHERE mrp.id = candidates.id
  RETURNING mrp.id
)
INSERT INTO mobile_release_policy_audit (
  policy_id, market_code, client_type, platform, revision, action, reason,
  previous_policy, new_policy
)
SELECT mrp.id, mrp.market_code, mrp.client_type, mrp.platform, mrp.revision,
       'updated', 'Point mobile update destination to the LANCAR release repository',
       candidates.previous_policy, to_jsonb(mrp) - 'id'
FROM changed
JOIN candidates ON candidates.id = changed.id
JOIN mobile_release_policies mrp ON mrp.id = changed.id;

-- +goose Down
UPDATE system_configs
SET value = to_jsonb('https://github.com/yogisyahroni/TEMBUS/releases'::text),
    description = 'URL to download latest APK'
WHERE key = 'mobile_update_url'
  AND value #>> '{}' = 'https://github.com/yogisyahroni/LANCAR/releases';

WITH candidates AS (
  SELECT id, to_jsonb(mrp) - 'id' AS previous_policy
  FROM mobile_release_policies mrp
  WHERE mrp.store_destinations #>> '{primary}' = 'https://github.com/yogisyahroni/LANCAR/releases'
), changed AS (
  UPDATE mobile_release_policies mrp
  SET store_destinations = jsonb_set(
        COALESCE(mrp.store_destinations, '{}'::jsonb),
        '{primary}',
        to_jsonb('https://github.com/yogisyahroni/TEMBUS/releases'::text),
        TRUE
      ),
      revision = mrp.revision + 1,
      updated_at = NOW()
  FROM candidates
  WHERE mrp.id = candidates.id
  RETURNING mrp.id
)
INSERT INTO mobile_release_policy_audit (
  policy_id, market_code, client_type, platform, revision, action, reason,
  previous_policy, new_policy
)
SELECT mrp.id, mrp.market_code, mrp.client_type, mrp.platform, mrp.revision,
       'rolled_back', 'Restore the legacy mobile release destination',
       candidates.previous_policy, to_jsonb(mrp) - 'id'
FROM changed
JOIN candidates ON candidates.id = changed.id
JOIN mobile_release_policies mrp ON mrp.id = changed.id;
