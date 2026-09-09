-- +goose Up

-- ADMEXP-2026-018: backfill active legacy global banners into the existing
-- Experience manifest boundary. The backfill is deterministic per market and
-- idempotent, while promo economics and runtime flags remain in their
-- existing authoritative domains.
--
-- The canonical checksum helper is temporary and is removed in this
-- migration. It mirrors the application canonicalizer: object keys are
-- sorted recursively, arrays retain order, and scalar JSON is preserved.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION admexp_json_canonical(value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result text;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    SELECT COALESCE(
      '{' || string_agg(to_jsonb(pair.key)::text || ':' || admexp_json_canonical(pair.value), ',' ORDER BY pair.key) || '}',
      '{}'
    )
      INTO result
      FROM jsonb_each(value) AS pair(key, value);
    RETURN result;
  END IF;

  IF jsonb_typeof(value) = 'array' THEN
    SELECT COALESCE(
      '[' || string_agg(admexp_json_canonical(item.value), ',' ORDER BY item.ordinality) || ']',
      '[]'
    )
      INTO result
      FROM jsonb_array_elements(value) WITH ORDINALITY AS item(value, ordinality);
    RETURN result;
  END IF;

  RETURN value::text;
END;
$$;
-- +goose StatementEnd

WITH legacy AS (
  SELECT
    b.id,
    b.title,
    b.message,
    b.image_url,
    b.action_url,
    b.action_label,
    b.priority,
    b.created_at,
    m.market_code,
    m.default_locale,
    m.timezone
  FROM global_banners b
  CROSS JOIN market_configs m
  WHERE b.status = 'active'
), aggregated AS (
  SELECT
    market_code,
    default_locale,
    timezone,
    ('00000000-0000-5000-8000-' || substring(md5('admexp:legacy-global-banners:' || market_code), 1, 12))::uuid AS manifest_id,
    min(created_at) AS starts_at,
    jsonb_agg(
      jsonb_build_object(
        'id', 'legacy-banner-' || replace(id::text, '-', ''),
        'component', 'hero_banner',
        'properties', jsonb_strip_nulls(jsonb_build_object(
          'title', CASE
            WHEN title ~* 'javascript:|data:text/html' THEN 'LANCAR'
            ELSE left(regexp_replace(NULLIF(trim(title), ''), '[<>]', '', 'g'), 120)
          END,
          'body', CASE
            WHEN message ~* 'javascript:|data:text/html' THEN 'Informasi terbaru dari LANCAR.'
            ELSE left(regexp_replace(NULLIF(trim(message), ''), '[<>]', '', 'g'), 500)
          END,
          'badge', 'Legacy banner',
          'cta_label', CASE
            WHEN NULLIF(trim(action_label), '') IS NOT NULL
              AND (action_url ~ '^/(home|food|promo|orders|support|profile)([/#?].*)?$'
                OR action_url ~ '^https://(bawain\.my\.id|www\.bawain\.my\.id|app\.bawain\.my\.id)(/[^#]*)?$')
            THEN left(regexp_replace(trim(action_label), '[<>]', '', 'g'), 80)
          END,
          'deep_link', CASE
            WHEN action_url ~ '^/(home|food|promo|orders|support|profile)([/#?].*)?$' THEN action_url
          END,
          'external_url', CASE
            WHEN action_url ~ '^https://(bawain\.my\.id|www\.bawain\.my\.id|app\.bawain\.my\.id)(/[^#]*)?$' THEN action_url
          END
        ))
      )
      ORDER BY priority DESC, created_at DESC, id
    ) AS sections,
    jsonb_agg(to_jsonb(id::text) ORDER BY priority DESC, created_at DESC, id) AS source_banner_ids,
    COALESCE(
      jsonb_agg(to_jsonb(id::text) ORDER BY priority DESC, created_at DESC, id)
        FILTER (WHERE NULLIF(trim(image_url), '') IS NOT NULL),
      '[]'::jsonb
    ) AS source_banner_ids_requiring_asset_import,
    COALESCE(
      jsonb_agg(to_jsonb(id::text) ORDER BY priority DESC, created_at DESC, id)
        FILTER (WHERE NULLIF(trim(action_url), '') IS NOT NULL
          AND action_url !~ '^/(home|food|promo|orders|support|profile)([/#?].*)?$'
          AND action_url !~ '^https://(bawain\.my\.id|www\.bawain\.my\.id|app\.bawain\.my\.id)(/[^#]*)?$'),
      '[]'::jsonb
    ) AS source_banner_ids_with_unsupported_actions
  FROM legacy
  GROUP BY market_code, default_locale, timezone
), payloads AS (
  SELECT
    aggregated.*,
    jsonb_build_object(
      'manifest_id', manifest_id,
      'revision', 1,
      'schema_version', 1,
      'market_code', market_code,
      'locale', default_locale,
      'surface', 'customer_android',
      'min_app_version', '0.0.0',
      'max_app_version', NULL,
      'starts_at', to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'ends_at', NULL,
      'schedule_timezone', timezone,
      'rollout_stage', 'public',
      'canary_cohort', NULL,
      'ttl_seconds', 300,
      'cache_policy', 'private',
      'targeting', jsonb_build_object(
        'cohorts', '[]'::jsonb,
        'market_codes', '[]'::jsonb,
        'city_codes', '[]'::jsonb,
        'zone_codes', '[]'::jsonb,
        'locales', '[]'::jsonb,
        'service_usage_cohorts', '[]'::jsonb,
        'roles', '[]'::jsonb,
        'experiment_assignments', '[]'::jsonb
      ),
      'sections', sections,
      'asset_references', '[]'::jsonb
    ) AS payload
  FROM aggregated
), inserted AS (
  INSERT INTO experience_manifest_revisions (
    manifest_id,
    revision,
    schema_version,
    market_code,
    locale,
    surface,
    min_app_version,
    max_app_version,
    starts_at,
    ends_at,
    schedule_timezone,
    rollout_stage,
    canary_cohort,
    requires_approval,
    approval_status,
    ttl_seconds,
    cache_policy,
    targeting,
    sections,
    asset_references,
    content_checksum,
    signature,
    state,
    published_at
  )
  SELECT
    manifest_id,
    1,
    1,
    market_code,
    default_locale,
    'customer_android',
    '0.0.0',
    NULL,
    starts_at,
    NULL,
    timezone,
    'public',
    NULL,
    FALSE,
    'not_required',
    300,
    'private',
    payload->'targeting',
    sections,
    '[]'::jsonb,
    encode(digest(convert_to(admexp_json_canonical(payload), 'UTF8'), 'sha256'), 'hex'),
    NULL,
    'published',
    NOW()
  FROM payloads
  ON CONFLICT (manifest_id, revision) DO NOTHING
  RETURNING id, manifest_id, revision
)
INSERT INTO experience_manifest_audit (
  revision_id,
  manifest_id,
  revision,
  action,
  reason,
  previous_state,
  new_state,
  metadata
)
SELECT
  inserted.id,
  inserted.manifest_id,
  inserted.revision,
  'published',
  'ADMEXP-2026-018 legacy banner backfill and one-source-of-truth cutover',
  NULL,
  'published',
  jsonb_build_object(
    'migration', 'ADMEXP-2026-018',
    'source_table', 'global_banners',
    'source_banner_ids', payloads.source_banner_ids,
    'source_banner_ids_requiring_asset_import', payloads.source_banner_ids_requiring_asset_import,
    'source_banner_ids_with_unsupported_actions', payloads.source_banner_ids_with_unsupported_actions,
    'legacy_write_route', '/admin/banners',
    'replacement_route', '/admin/experience/manifests'
  )
FROM inserted
JOIN payloads USING (manifest_id);

DROP FUNCTION admexp_json_canonical(jsonb);

-- +goose Down
-- Remove only revisions created by this deterministic backfill. The legacy
-- global_banners data itself is retained for the mobile compatibility fallback.
ALTER TABLE experience_manifest_audit DISABLE TRIGGER trg_experience_manifest_audit_immutable;
ALTER TABLE experience_manifest_revisions DISABLE TRIGGER trg_experience_manifest_immutable;

WITH generated AS (
  SELECT ('00000000-0000-5000-8000-' || substring(md5('admexp:legacy-global-banners:' || market_code), 1, 12))::uuid AS manifest_id
  FROM market_configs
)
DELETE FROM experience_manifest_audit audit
USING generated
WHERE audit.manifest_id = generated.manifest_id
  AND audit.metadata->>'migration' = 'ADMEXP-2026-018';

WITH generated AS (
  SELECT ('00000000-0000-5000-8000-' || substring(md5('admexp:legacy-global-banners:' || market_code), 1, 12))::uuid AS manifest_id
  FROM market_configs
)
DELETE FROM experience_manifest_revisions revisions
USING generated
WHERE revisions.manifest_id = generated.manifest_id
  AND revisions.revision = 1
  AND revisions.state = 'published';

ALTER TABLE experience_manifest_revisions ENABLE TRIGGER trg_experience_manifest_immutable;
ALTER TABLE experience_manifest_audit ENABLE TRIGGER trg_experience_manifest_audit_immutable;
