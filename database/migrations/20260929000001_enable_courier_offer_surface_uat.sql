-- +goose Up

-- The Tambal Ban offer surface is ready for the requested courier UAT.
-- Keep this in the canonical feature-flag store so the app remains
-- server-controlled and can still be disabled without a mobile rebuild.
UPDATE feature_flags
SET
  is_enabled = TRUE,
  config = COALESCE(config, '{}'::jsonb) || '{"mode":"uat","client_types":["courier"]}'::jsonb,
  evaluation_revision = COALESCE(evaluation_revision, 1) + 1,
  updated_at = NOW()
WHERE key = 'courier_offer_surface';

-- +goose Down
UPDATE feature_flags
SET
  is_enabled = FALSE,
  config = COALESCE(config, '{}'::jsonb) || '{"mode":"off","client_types":["courier"]}'::jsonb,
  evaluation_revision = COALESCE(evaluation_revision, 1) + 1,
  updated_at = NOW()
WHERE key = 'courier_offer_surface';
