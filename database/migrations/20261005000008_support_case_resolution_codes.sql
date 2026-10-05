-- +goose Up

-- MWEB-PORTAL-P0-008: durable issue resolution taxonomy.
ALTER TABLE support_cases
  ADD COLUMN IF NOT EXISTS resolution_code VARCHAR(48);

ALTER TABLE support_cases
  DROP CONSTRAINT IF EXISTS support_cases_resolution_code_check;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_resolution_code_check CHECK (
    resolution_code IS NULL OR resolution_code IN (
      'merchant_error',
      'customer_refund',
      'courier_issue',
      'item_unavailable',
      'quality_issue',
      'payment_issue',
      'safety_escalation',
      'duplicate_case',
      'no_issue_found',
      'provider_failure',
      'other'
    )
  );

CREATE INDEX IF NOT EXISTS idx_support_cases_resolution
  ON support_cases(resolution_code, resolved_at DESC)
  WHERE resolution_code IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_support_cases_resolution;
ALTER TABLE support_cases DROP CONSTRAINT IF EXISTS support_cases_resolution_code_check;
ALTER TABLE support_cases DROP COLUMN IF EXISTS resolution_code;
