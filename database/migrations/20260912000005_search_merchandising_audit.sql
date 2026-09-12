-- +goose Up

-- Append-only audit trail for reviewed search merchandising changes. The
-- audit stores policy metadata, never ranking truth such as price/ETA/rating.
CREATE TABLE IF NOT EXISTS search_merchandising_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES search_merchandising_rules(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  action VARCHAR(16) NOT NULL,
  reason TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_merchandising_audit_rule
  ON search_merchandising_audit(rule_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_search_merchandising_audit_rule;
DROP TABLE IF EXISTS search_merchandising_audit;
