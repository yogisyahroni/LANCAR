-- +goose Up
-- Central risk decisions are separate from order state. The order service
-- owns writes so financial/order transitions never depend on an admin read
-- model or a second transaction authority.
CREATE TABLE IF NOT EXISTS risk_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation VARCHAR(64) NOT NULL,
  market_code VARCHAR(32) NOT NULL,
  entity_type VARCHAR(48) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  subject_key_hash VARCHAR(128) NOT NULL,
  decision VARCHAR(16) NOT NULL CHECK (decision IN ('ALLOW', 'CHALLENGE', 'REVIEW', 'HOLD', 'BLOCK')),
  risk_score NUMERIC(5,2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  signal_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_version VARCHAR(96) NOT NULL,
  failure_mode VARCHAR(24) NOT NULL DEFAULT 'normal'
    CHECK (failure_mode IN ('normal', 'timeout', 'engine_error', 'persist_error')),
  correlation_id VARCHAR(128),
  idempotency_key VARCHAR(192) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT risk_decisions_signal_snapshot_object CHECK (jsonb_typeof(signal_snapshot) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_decisions_operation_idempotency
  ON risk_decisions(operation, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_risk_decisions_review_queue
  ON risk_decisions(decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_decisions_entity
  ON risk_decisions(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_decisions_market_operation
  ON risk_decisions(market_code, operation, created_at DESC);

CREATE TABLE IF NOT EXISTS risk_manual_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_decision_id UUID NOT NULL UNIQUE REFERENCES risk_decisions(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RESOLVED', 'CANCELLED')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision VARCHAR(16) CHECK (decision IS NULL OR decision IN ('ALLOW', 'CHALLENGE', 'REVIEW', 'HOLD', 'BLOCK')),
  reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT risk_manual_reviews_evidence_object CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT risk_manual_reviews_resolution_fields CHECK (
    status = 'PENDING' OR (reviewer_id IS NOT NULL AND decision IS NOT NULL AND NULLIF(BTRIM(reason), '') IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_risk_manual_reviews_queue
  ON risk_manual_reviews(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_risk_manual_reviews_reviewer
  ON risk_manual_reviews(reviewer_id, reviewed_at DESC);

INSERT INTO system_configs (key, value, description, category) VALUES
  ('risk_engine_enabled', 'true'::jsonb, 'Enable canonical marketplace risk decisions', 'risk'),
  ('risk_policy_version', '"risk-rules-2026-09-09-v1"'::jsonb, 'Version of the governed risk policy set', 'risk'),
  ('risk.policy.id-jk.order_create', '{"market_code":"id-jk","operation":"order_create","version":"risk-rules-2026-09-09-v1","timeout_millis":250,"on_timeout":"fail_open","on_engine_error":"fail_open","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for parcel order creation', 'risk'),
  ('risk.policy.id-jk.food_order_create', '{"market_code":"id-jk","operation":"food_order_create","version":"risk-rules-2026-09-09-v1","timeout_millis":250,"on_timeout":"fail_open","on_engine_error":"fail_open","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for food order creation', 'risk'),
  ('risk.policy.id-jk.dispatch_accept', '{"market_code":"id-jk","operation":"dispatch_accept","version":"risk-rules-2026-09-09-v1","timeout_millis":250,"on_timeout":"fail_open","on_engine_error":"fail_open","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for courier dispatch acceptance', 'risk'),
  ('risk.policy.id-jk.payment_authorization', '{"market_code":"id-jk","operation":"payment_authorization","version":"risk-rules-2026-09-09-v1","timeout_millis":500,"on_timeout":"fail_closed","on_engine_error":"fail_closed","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for payment authorization', 'risk'),
  ('risk.policy.id-jk.refund_request', '{"market_code":"id-jk","operation":"refund_request","version":"risk-rules-2026-09-09-v1","timeout_millis":500,"on_timeout":"fail_closed","on_engine_error":"fail_closed","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for refund requests', 'risk'),
  ('risk.policy.id-jk.claim_submission', '{"market_code":"id-jk","operation":"claim_submission","version":"risk-rules-2026-09-09-v1","timeout_millis":500,"on_timeout":"fail_closed","on_engine_error":"fail_closed","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for claims', 'risk'),
  ('risk.policy.id-jk.provider_callback', '{"market_code":"id-jk","operation":"provider_callback","version":"risk-rules-2026-09-09-v1","timeout_millis":500,"on_timeout":"fail_closed","on_engine_error":"fail_closed","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for provider callbacks', 'risk'),
  ('risk.policy.id-jk.handoff_delivery', '{"market_code":"id-jk","operation":"handoff_delivery","version":"risk-rules-2026-09-09-v1","timeout_millis":500,"on_timeout":"fail_closed","on_engine_error":"fail_closed","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for handoff and proof', 'risk'),
  ('risk.policy.id-jk.payout_request', '{"market_code":"id-jk","operation":"payout_request","version":"risk-rules-2026-09-09-v1","timeout_millis":500,"on_timeout":"fail_closed","on_engine_error":"fail_closed","challenge_score":20,"review_score":45,"hold_score":70,"block_score":90,"sensitive_attributes_allowed":false}'::jsonb, 'Risk policy for courier payout requests', 'risk')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DROP INDEX IF EXISTS idx_risk_manual_reviews_reviewer;
DROP INDEX IF EXISTS idx_risk_manual_reviews_queue;
DROP TABLE IF EXISTS risk_manual_reviews;
DROP INDEX IF EXISTS idx_risk_decisions_market_operation;
DROP INDEX IF EXISTS idx_risk_decisions_entity;
DROP INDEX IF EXISTS idx_risk_decisions_review_queue;
DROP INDEX IF EXISTS uq_risk_decisions_operation_idempotency;
DROP TABLE IF EXISTS risk_decisions;
DELETE FROM system_configs WHERE key IN (
  'risk_engine_enabled', 'risk_policy_version',
  'risk.policy.id-jk.order_create', 'risk.policy.id-jk.food_order_create',
  'risk.policy.id-jk.dispatch_accept', 'risk.policy.id-jk.payment_authorization',
  'risk.policy.id-jk.refund_request', 'risk.policy.id-jk.claim_submission',
  'risk.policy.id-jk.provider_callback', 'risk.policy.id-jk.handoff_delivery',
  'risk.policy.id-jk.payout_request'
);
