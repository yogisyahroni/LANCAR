-- +goose Up

-- Temporary UAT kill switch for the courier offer surface. The mobile client
-- fails closed when this flag is absent, and operators can re-enable the
-- offer UI from the existing feature-flag control plane after the redesign.
INSERT INTO feature_flags (
  key,
  name,
  description,
  is_enabled,
  category,
  require_checklist,
  config
)
VALUES (
  'courier_offer_surface',
  'Courier Offer Surface',
  'Controls incoming on-demand offer UI and notifications in the courier app.',
  FALSE,
  'feature',
  FALSE,
  '{"mode":"off","client_types":["courier"]}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_enabled = FALSE,
  category = EXCLUDED.category,
  require_checklist = EXCLUDED.require_checklist;

-- +goose Down
DELETE FROM feature_flags WHERE key = 'courier_offer_surface';
