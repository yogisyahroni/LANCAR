-- +goose Up
INSERT INTO feature_flags (
  key,
  description,
  is_enabled,
  category,
  require_checklist,
  config,
  updated_at
)
VALUES (
  'courier_login_otp_required',
  'Require OTP challenge for courier mobile login on untrusted devices. Development can disable this from the admin feature flag panel without changing production code.',
  TRUE,
  'security',
  TRUE,
  '{"scope":"courier_mobile_login","default":"production_required","development_can_disable_from_admin":true}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  require_checklist = EXCLUDED.require_checklist,
  config = COALESCE(feature_flags.config, EXCLUDED.config),
  updated_at = NOW();

-- +goose Down
DELETE FROM feature_flags WHERE key = 'courier_login_otp_required';
