-- +goose Up
-- GLOB-2026-008: governed experimentation on top of the existing platform DB.
-- Assignment identity is HMAC-derived in order-service; raw subject IDs are
-- deliberately absent from this schema.
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  namespace VARCHAR(80) NOT NULL DEFAULT 'default',
  status VARCHAR(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'killed', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(targeting) = 'object'),
  variants JSONB NOT NULL
    CHECK (jsonb_typeof(variants) = 'array'),
  guardrails JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(guardrails) = 'array'),
  kill_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiments_status_namespace
  ON experiments(status, namespace, updated_at DESC);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  subject_type VARCHAR(16) NOT NULL CHECK (subject_type IN ('customer', 'courier', 'anonymous')),
  subject_hash VARCHAR(128) NOT NULL,
  bucket INTEGER NOT NULL CHECK (bucket >= 0 AND bucket < 10000),
  variant VARCHAR(120) NOT NULL,
  experiment_version INTEGER NOT NULL CHECK (experiment_version > 0),
  targeting_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(targeting_snapshot) = 'object'),
  variant_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(variant_payload) = 'object'),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_exposure_at TIMESTAMPTZ,
  last_exposure_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (experiment_id, subject_type, subject_hash)
);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_subject
  ON experiment_assignments(subject_type, subject_hash, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_experiment_assignments_experiment_variant
  ON experiment_assignments(experiment_id, variant, assigned_at DESC);

CREATE TABLE IF NOT EXISTS experiment_exposures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES experiment_assignments(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  exposure_type VARCHAR(8) NOT NULL CHECK (exposure_type IN ('seen', 'used')),
  surface VARCHAR(120) NOT NULL,
  dedupe_key VARCHAR(240) NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, exposure_type, surface)
);

CREATE INDEX IF NOT EXISTS idx_experiment_exposures_experiment_time
  ON experiment_exposures(experiment_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_experiment_exposures_assignment
  ON experiment_exposures(assignment_id, occurred_at DESC);

-- The service-role migration predates these tables. Keep ownership explicit so
-- production deployments using least-privilege roles can run the feature.
GRANT SELECT, INSERT, UPDATE, DELETE ON experiments TO tembus_admin;
GRANT SELECT ON experiment_assignments, experiment_exposures TO tembus_admin;
GRANT SELECT, INSERT, UPDATE ON experiments TO tembus_order;
GRANT SELECT, INSERT, UPDATE ON experiment_assignments, experiment_exposures TO tembus_order;

INSERT INTO experiments (key, name, namespace, status, version, targeting, variants, guardrails)
VALUES (
  'food_home_layout_v1',
  'Food home layout v1',
  'food_home',
  'draft',
  1,
  '{"service_codes":["food_delivery"]}'::jsonb,
  '[{"key":"control","weight_basis_points":5000,"payload":{}},{"key":"treatment","weight_basis_points":5000,"payload":{"layout":"dense_cards"}}]'::jsonb,
  '[
    {"metric":"crash_error_rate","event_types":["app.crash","app.error"],"threshold":0,"direction":"max"},
    {"metric":"cancellation_rate","event_types":["order.cancelled"],"threshold":0,"direction":"max"},
    {"metric":"refund_rate","event_types":["refund.created","payment.refunded"],"threshold":0,"direction":"max"},
    {"metric":"eta_sla","event_types":["sla.measured"],"threshold":0,"direction":"max"},
    {"metric":"support_contact_rate","event_types":["support.contact.created"],"threshold":0,"direction":"max"}
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DROP INDEX IF EXISTS idx_experiment_exposures_assignment;
DROP INDEX IF EXISTS idx_experiment_exposures_experiment_time;
DROP TABLE IF EXISTS experiment_exposures;
DROP INDEX IF EXISTS idx_experiment_assignments_experiment_variant;
DROP INDEX IF EXISTS idx_experiment_assignments_subject;
DROP TABLE IF EXISTS experiment_assignments;
DROP INDEX IF EXISTS idx_experiments_status_namespace;
DROP TABLE IF EXISTS experiments;
