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
  'customer_registration_otp_required',
  'Require OTP challenge for new customer registration. Keep enabled in production; local/UAT may disable it while the email OTP provider is not configured.',
  TRUE,
  'security',
  TRUE,
  '{"scope":"customer_registration","default":"production_required","local_uat_can_disable":true}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  require_checklist = EXCLUDED.require_checklist,
  config = COALESCE(feature_flags.config, EXCLUDED.config),
  updated_at = NOW();

-- +goose Down
DELETE FROM feature_flags WHERE key = 'customer_registration_otp_required';
