-- +goose Up
-- ECON-2026-009: versioned economics control plane with maker/checker guardrails.
-- Runtime pricing remains in system_configs; this table owns workflow, impact
-- preview metadata, and immutable actor/reason evidence for each change.
CREATE TABLE IF NOT EXISTS marketplace_economic_policy_revisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_key          VARCHAR(160) NOT NULL,
    policy_type         VARCHAR(20) NOT NULL CHECK (policy_type IN ('pricing', 'surge')),
    runtime_config_key  VARCHAR(100) NOT NULL,
    policy_version      VARCHAR(100) NOT NULL,
    market_code         VARCHAR(32) NOT NULL,
    zone_id             UUID REFERENCES zones(id),
    service_code        VARCHAR(64) NOT NULL,
    payload             JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    previous_payload    JSONB CHECK (previous_payload IS NULL OR jsonb_typeof(previous_payload) = 'object'),
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'approved', 'published', 'rolled_back')),
    business_reason     TEXT NOT NULL CHECK (char_length(btrim(business_reason)) BETWEEN 3 AND 2000),
    created_by          UUID NOT NULL REFERENCES users(id),
    approved_by         UUID REFERENCES users(id),
    approved_at         TIMESTAMPTZ,
    published_by        UUID REFERENCES users(id),
    published_at        TIMESTAMPTZ,
    rolled_back_by      UUID REFERENCES users(id),
    rolled_back_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (policy_key, policy_version),
    CHECK (btrim(policy_key) <> ''),
    CHECK (btrim(runtime_config_key) <> ''),
    CHECK (btrim(policy_version) <> ''),
    CHECK (btrim(market_code) <> ''),
    CHECK (btrim(service_code) <> ''),
    CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by <> created_by)),
    CHECK (status <> 'published' OR (approved_by IS NOT NULL AND published_by IS NOT NULL AND published_at IS NOT NULL)),
    CHECK (status <> 'rolled_back' OR (rolled_back_by IS NOT NULL AND rolled_back_at IS NOT NULL AND previous_payload IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_marketplace_economic_revisions_status
  ON marketplace_economic_policy_revisions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_economic_revisions_scope
  ON marketplace_economic_policy_revisions (market_code, zone_id, service_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_economic_revisions_runtime_key
  ON marketplace_economic_policy_revisions (runtime_config_key, created_at DESC);

-- Prevent callers from skipping the maker/checker workflow by changing a row
-- directly. The service still performs authorization and row locking; this is
-- the database invariant for other writers and operational SQL tooling.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION enforce_marketplace_economic_revision_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status = 'approved') OR
      (OLD.status = 'approved' AND NEW.status = 'published') OR
      (OLD.status = 'published' AND NEW.status = 'rolled_back')
    ) THEN
      RAISE EXCEPTION 'invalid economics policy status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF NEW.status = 'approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.approved_by = NEW.created_by) THEN
    RAISE EXCEPTION 'approved economics policy requires a different checker';
  END IF;
  IF NEW.status = 'published' AND (NEW.approved_by IS NULL OR NEW.published_by IS NULL OR NEW.published_at IS NULL) THEN
    RAISE EXCEPTION 'published economics policy requires approval and publisher';
  END IF;
  IF NEW.status = 'rolled_back' AND (NEW.rolled_back_by IS NULL OR NEW.rolled_back_at IS NULL OR NEW.previous_payload IS NULL) THEN
    RAISE EXCEPTION 'rolled back economics policy requires rollback actor and previous payload';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_enforce_marketplace_economic_revision_transition
  ON marketplace_economic_policy_revisions;
CREATE TRIGGER trg_enforce_marketplace_economic_revision_transition
BEFORE INSERT OR UPDATE ON marketplace_economic_policy_revisions
FOR EACH ROW
EXECUTE FUNCTION enforce_marketplace_economic_revision_transition();

-- +goose Down
DROP TRIGGER IF EXISTS trg_enforce_marketplace_economic_revision_transition
  ON marketplace_economic_policy_revisions;
DROP FUNCTION IF EXISTS enforce_marketplace_economic_revision_transition();
DROP INDEX IF EXISTS idx_marketplace_economic_revisions_status;
DROP INDEX IF EXISTS idx_marketplace_economic_revisions_scope;
DROP INDEX IF EXISTS idx_marketplace_economic_revisions_runtime_key;
DROP TABLE IF EXISTS marketplace_economic_policy_revisions;
