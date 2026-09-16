const { db } = require('./dist/db.js');
const { createHash } = require('crypto');
const { canonicalExperienceManifestPayload } = require('./dist/services/experienceConfig.js');

async function setGocarBanner() {
  const manifestId = '00000000-0000-5000-8000-3d7d6254b398';
  const sections = [
    {
      id: 'gocar-hero-banner',
      component: 'hero_banner',
      enabled: true,
      properties: {
        background_image_url: '/uploads/banners/gocar_header_banner.png',
        banner_mode: 'image',
        placement: 'header',
        deep_link: '/promo',
        campaign_id: 'gocar_muraaah_2026'
      }
    }
  ];
  const targeting = {
    roles: [],
    cohorts: [],
    locales: [],
    city_codes: [],
    zone_codes: [],
    market_codes: [],
    service_usage_cohorts: [],
    experiment_assignments: []
  };
  const revRes = await db.query(
    'SELECT COALESCE(MAX(revision), 0) + 1 AS next_rev FROM experience_manifest_revisions WHERE manifest_id = $1',
    [manifestId]
  );
  const nextRev = parseInt(revRes.rows[0].next_rev, 10);

  const payload = canonicalExperienceManifestPayload({
    manifest_id: manifestId,
    revision: nextRev,
    schema_version: 1,
    market_code: 'id-jk',
    locale: 'id-ID',
    surface: 'customer_android',
    min_app_version: '0.0.0',
    max_app_version: null,
    starts_at: '2026-08-01T00:00:00.000Z',
    ends_at: null,
    schedule_timezone: 'Asia/Jakarta',
    rollout_stage: 'public',
    canary_cohort: null,
    rollout_percentage: 100,
    ttl_seconds: 300,
    cache_policy: 'private',
    targeting,
    sections,
    asset_references: []
  });
  const checksum = createHash('sha256').update(payload).digest('hex');

  await db.query(
    "UPDATE experience_manifest_revisions SET state = 'superseded' WHERE manifest_id = $1 AND state = 'published'",
    [manifestId]
  );

  await db.query(
    `INSERT INTO experience_manifest_revisions (
      manifest_id, revision, schema_version, market_code, locale, surface, min_app_version,
      starts_at, ttl_seconds, cache_policy, targeting, sections, asset_references,
      content_checksum, state, schedule_timezone, rollout_stage, rollout_percentage
    ) VALUES (
      $1, $2, 1, 'id-jk', 'id-ID', 'customer_android', '0.0.0',
      NOW(), 300, 'private', $3, $4, '[]'::jsonb,
      $5, 'published', 'Asia/Jakarta', 'public', 100
    )`,
    [manifestId, nextRev, JSON.stringify(targeting), JSON.stringify(sections), checksum]
  );
  console.log(`SUCCESS_SET_GOCAR_BANNER revision ${nextRev} with checksum:`, checksum);
  process.exit(0);
}

setGocarBanner().catch(err => {
  console.error('ERROR_SET_GOCAR_BANNER:', err);
  process.exit(1);
});
