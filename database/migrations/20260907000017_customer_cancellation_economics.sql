-- +goose Up
-- ECON-2026-007: persist the cancellation policy and customer-visible fee
-- calculation alongside the refund record. This is an immutable audit
-- snapshot; changing a policy later must not reprice an old cancellation.
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS cancellation_policy_version VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cancellation_fee_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_fee_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_cancellation_fee_non_negative;
ALTER TABLE refunds ADD CONSTRAINT refunds_cancellation_fee_non_negative CHECK (cancellation_fee_idr >= 0);

-- +goose Down
ALTER TABLE refunds
  DROP CONSTRAINT IF EXISTS refunds_cancellation_fee_non_negative,
  DROP COLUMN IF EXISTS cancellation_fee_breakdown,
  DROP COLUMN IF EXISTS cancellation_fee_idr,
  DROP COLUMN IF EXISTS cancellation_policy_version;
