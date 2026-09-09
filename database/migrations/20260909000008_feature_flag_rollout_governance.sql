-- +goose Up

-- APP-2026-007: every flag change advances the revision returned to clients.
-- The revision is deliberately server-owned; clients never calculate it.
ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS evaluation_revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_evaluation_revision_ck;

ALTER TABLE feature_flags
  ADD CONSTRAINT feature_flags_evaluation_revision_ck
  CHECK (evaluation_revision > 0);

ALTER TABLE feature_flag_logs
  ADD COLUMN IF NOT EXISTS evaluation_revision BIGINT;

CREATE INDEX IF NOT EXISTS idx_feature_flags_revision
  ON feature_flags (evaluation_revision);

CREATE INDEX IF NOT EXISTS idx_feature_flag_logs_key_revision
  ON feature_flag_logs (key, evaluation_revision, created_at DESC);

-- Safe, non-transactional customer/merchant/courier entry switches. Their
-- defaults preserve the existing product surface while allowing an operator
-- to disable only the optional entry point without shipping a new binary.
INSERT INTO feature_flags (key, name, description, is_enabled, category, require_checklist, config)
VALUES
  ('customer_food_entry', 'Customer Food Entry', 'Optional customer food discovery entry point', TRUE, 'feature', FALSE,
   '{"mode":"on","client_types":["customer","web"]}'::jsonb),
  ('merchant_menu_entry', 'Merchant Menu Entry', 'Optional merchant menu management entry point', TRUE, 'feature', FALSE,
   '{"mode":"on","client_types":["merchant"]}'::jsonb),
  ('courier_service_discovery_entry', 'Courier Service Discovery', 'Optional courier service discovery entry point', TRUE, 'feature', FALSE,
   '{"mode":"on","client_types":["courier"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM feature_flags
WHERE key IN ('customer_food_entry', 'merchant_menu_entry', 'courier_service_discovery_entry');

DROP INDEX IF EXISTS idx_feature_flag_logs_key_revision;
DROP INDEX IF EXISTS idx_feature_flags_revision;

ALTER TABLE feature_flag_logs
  DROP COLUMN IF EXISTS evaluation_revision;

ALTER TABLE feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_evaluation_revision_ck;

ALTER TABLE feature_flags
  DROP COLUMN IF EXISTS evaluation_revision;
